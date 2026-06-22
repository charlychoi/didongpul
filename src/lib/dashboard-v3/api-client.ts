import {
  ApiCollection,
  DidongCouponRow,
  DidongSurveyRow,
  DidongTotalRow,
  DidongVisitRow,
  DidongWaitingRow,
  DidongWebsiteStatsRow,
  DidongWebsiteVisitorRow,
  PagedResponse,
  V3_CENTERS,
  V3Query,
} from "./types";
import { getDashboardV3ApiCache, setDashboardV3ApiCache } from "./db";

const DEFAULT_BASE_URL = "https://api.didong.kr/api";
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_PAGES = 500;
const MIN_REQUEST_GAP_MS = 80;
const DASHBOARD_PAGE_LIMIT = 10;
const DEFAULT_PER_PAGE = 100;

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const pendingFetches = new Map<string, Promise<ApiCollection<unknown>>>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

export interface DashboardV3SourceOptions {
  totals?: boolean;
  visits?: boolean;
  waitings?: boolean;
  surveys?: boolean;
  coupons?: boolean;
  websiteVisitors?: boolean;
  websiteStats?: boolean;
  pageLimit?: number;
  exactTotals?: boolean;
}

function getBaseUrl() {
  return (process.env.DIDONG_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getApiKey() {
  const key = process.env.DIDONG_API_KEY;
  if (!key) {
    throw new Error("DIDONG_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return key;
}

function toQueryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthEnd(value: string) {
  const [year, month] = value.split("-").map(Number);
  return dateOnly(new Date(Date.UTC(year, month, 0)));
}

function addMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return dateOnly(new Date(Date.UTC(year, month, 1)));
}

function monthWindows(startDate: string, endDate: string) {
  const windows: Array<{ startDate: string; endDate: string }> = [];
  let cursor = monthStart(startDate);
  while (cursor <= endDate) {
    const windowEnd = monthEnd(cursor);
    windows.push({
      startDate: cursor,
      endDate: windowEnd,
    });
    cursor = addMonth(cursor);
  }
  return windows;
}

function rowDate(row: unknown) {
  const item = row as Record<string, unknown>;
  const value =
    item.entered_at ??
    item.give_at ??
    item.used_at ??
    item.created_at ??
    item.visited_at ??
    item.survey_created_at ??
    item.finished_at ??
    item.updated_at ??
    item.date;
  if (typeof value !== "string") return null;
  const parsed = parseDate(value);
  return parsed ? dateOnly(parsed) : null;
}

function filterRowsByDate<T>(rows: T[], query: V3Query) {
  return rows.filter((row) => {
    const date = rowDate(row);
    return !date || (date >= query.startDate && date <= query.endDate);
  });
}

function responseRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== "object") return [];
  const item = data as Record<string, unknown>;
  const rows = [];
  if (Array.isArray(item.daily)) rows.push(...item.daily);
  if (Array.isArray(item.by_source)) rows.push(...item.by_source);
  return rows as T[];
}

function mergeCollections<T>(collections: ApiCollection<T>[], query: V3Query): ApiCollection<T> {
  const seen = new Set<string>();
  const data = [];
  for (const row of filterRowsByDate(collections.flatMap((collection) => collection.data), query)) {
    const key =
      (row as { id?: string | number | null }).id?.toString() ||
      (row as { uuid?: string | null }).uuid;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    data.push(row);
  }
  const errors = collections.map((collection) => collection.error).filter(Boolean);
  const centerTotals = collections.reduce<Record<string, number>>((acc, collection) => {
    for (const [center, total] of Object.entries(collection.centerTotals || {})) {
      acc[center] = (acc[center] ?? 0) + total;
    }
    return acc;
  }, {});
  return {
    data,
    total: data.length,
    centerTotals: Object.keys(centerTotals).length ? centerTotals : undefined,
    meta: collections.at(-1)?.meta,
    truncated: collections.some((collection) => collection.truncated),
    error: errors.join("\n") || undefined,
  };
}

async function fetchExactCenterTotals<T>(
  path: string,
  query: V3Query,
  extra?: Record<string, string | number | undefined>
) {
  const totals: Record<string, number> = {};
  for (const center of selectedCenters(query.center)) {
    const chunk = await safeFetch<T>(
      path,
      {
        center_type: center.code,
        started_at: query.startDate,
        finished_at: query.endDate,
        ...extra,
      },
      query.bypassCache,
      1
    );
    totals[center.name] = chunk.meta?.total ?? chunk.total;
  }
  return totals;
}

function withCenter<T>(
  collection: ApiCollection<T>,
  center: (typeof V3_CENTERS)[number]
): ApiCollection<T> {
  return {
    ...collection,
    data: collection.data.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        center_type: item.center_type ?? center.code,
        format_center_type: item.format_center_type ?? center.name,
      } as T;
    }),
  };
}

function normalizeError(path: string, status: number) {
  if (status === 401) return `${path}: API Key 인증 오류입니다.`;
  if (status === 404) return `${path}: 외부 API 경로를 확인해야 합니다.`;
  if (status === 429) return `${path}: API 호출이 일시적으로 많습니다.`;
  if (status >= 500) return `${path}: 외부 API 장애가 발생했습니다.`;
  return `${path}: 외부 API 오류 ${status}`;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("외부 API 응답 시간이 초과되었습니다.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForRequestSlot() {
  const run = requestQueue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsed));
    }
    lastRequestAt = Date.now();
  });
  requestQueue = run.catch(() => {});
  await run;
}

export async function didongGet<T>(
  path: string,
  params: Record<string, string | number | undefined>
): Promise<PagedResponse<T>> {
  const qs = toQueryString(params);
  const url = `${getBaseUrl()}${path}${qs ? `?${qs}` : ""}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    await waitForRequestSlot();
    const response = await fetchWithTimeout(url, {
      headers: { "X-API-KEY": getApiKey(), Accept: "application/json" },
      cache: "no-store",
    });

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 3_000 * (attempt + 1)));
      continue;
    }

    if (!response.ok) throw new Error(normalizeError(path, response.status));
    const json = await response.json();
    return Array.isArray(json) ? { data: json } : json;
  }

  throw new Error(normalizeError(path, 429));
}

export async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  bypassCache = false,
  pageLimit = MAX_PAGES
): Promise<ApiCollection<T>> {
  const cacheKey = `${path}:${pageLimit}:${JSON.stringify(params)}`;
  if (!bypassCache) {
    const pending = pendingFetches.get(cacheKey);
    if (pending) return pending as Promise<ApiCollection<T>>;
  }

  const cached = memoryCache.get(cacheKey);
  if (!bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.value as ApiCollection<T>;
  }

  if (!bypassCache) {
    const persisted = await getDashboardV3ApiCache(cacheKey);
    if (persisted) {
      memoryCache.set(cacheKey, persisted);
      return persisted.value as ApiCollection<T>;
    }
  }

  const request = (async () => {
    const data: T[] = [];
    let page = 1;
    let lastPage = 1;
    let latestMeta: PagedResponse<T>["meta"] | undefined;

    do {
      if (page > MAX_PAGES) throw new Error(`${path}: 페이지 수가 비정상적으로 많습니다.`);
      const response = await didongGet<T>(path, { per_page: DEFAULT_PER_PAGE, ...params, page });
      data.push(...responseRows<T>(response.data));
      latestMeta = response.meta;
      lastPage = response.meta?.last_page ?? page;
      page += 1;
    } while (page <= lastPage && page <= pageLimit);

    const truncated = page <= lastPage;

    const value: ApiCollection<T> = {
      data,
      total: latestMeta?.total ?? data.length,
      meta: latestMeta,
      truncated,
    };
    const record = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    memoryCache.set(cacheKey, record);
    await setDashboardV3ApiCache(cacheKey, record);
    return value;
  })();

  if (!bypassCache) pendingFetches.set(cacheKey, request as Promise<ApiCollection<unknown>>);
  try {
    return await request;
  } finally {
    pendingFetches.delete(cacheKey);
  }
}

async function safeFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  bypassCache: boolean | undefined,
  pageLimit?: number
): Promise<ApiCollection<T>> {
  try {
    return await fetchAllPages<T>(path, params, bypassCache, pageLimit);
  } catch (error) {
    return {
      data: [],
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function emptyCollection<T>(): ApiCollection<T> {
  return { data: [], total: 0, truncated: false };
}

function selectedCenters(center: V3Query["center"]) {
  if (center === "ALL") return V3_CENTERS;
  return V3_CENTERS.filter((item) => item.code === center);
}

async function fetchByCenter<T>(
  path: string,
  query: V3Query,
  extra?: Record<string, string | number | undefined>,
  pageLimit = DASHBOARD_PAGE_LIMIT,
  includeExactCenterTotals = false
) {
  const chunks = [];
  const windows = monthWindows(query.startDate, query.endDate);
  for (const center of selectedCenters(query.center)) {
    for (const window of windows) {
      const chunk = await safeFetch<T>(
          path,
          {
            center_type: center.code,
            started_at: window.startDate,
            finished_at: window.endDate,
            ...extra,
          },
          query.bypassCache,
          pageLimit
        );
      chunks.push(withCenter(chunk, center));
    }
  }

  const merged = mergeCollections(chunks, query);
  if (includeExactCenterTotals) {
    merged.centerTotals = await fetchExactCenterTotals<T>(path, query, extra);
    merged.total = Object.values(merged.centerTotals).reduce((sum, value) => sum + value, 0);
  }
  return merged;
}

async function fetchByMonth<T>(
  path: string,
  query: V3Query,
  params?: Record<string, string | number | undefined>,
  pageLimit = DASHBOARD_PAGE_LIMIT
) {
  const chunks = [];
  for (const window of monthWindows(query.startDate, query.endDate)) {
    chunks.push(
      await safeFetch<T>(
        path,
        { started_at: window.startDate, finished_at: window.endDate, ...params },
        query.bypassCache,
        pageLimit
      )
    );
  }
  return mergeCollections(chunks, query);
}

export async function fetchDashboardV3Sources(
  query: V3Query,
  options: DashboardV3SourceOptions = {
    totals: true,
    visits: true,
    waitings: true,
    surveys: true,
    coupons: true,
  }
) {
  const pageLimit = options.pageLimit ?? DASHBOARD_PAGE_LIMIT;
  const exactTotals = options.exactTotals !== false;
  const [
    totals,
    visits,
    waitings,
    surveys,
    coupons,
    websiteVisitors,
    websiteStats,
  ] = await Promise.all([
    options.totals
      ? fetchByCenter<DidongTotalRow>("/external/total", query, undefined, pageLimit, exactTotals)
      : Promise.resolve(emptyCollection<DidongTotalRow>()),
    options.visits
      ? fetchByCenter<DidongVisitRow>("/external/visits", query, undefined, pageLimit, exactTotals)
      : Promise.resolve(emptyCollection<DidongVisitRow>()),
    options.waitings
      ? fetchByCenter<DidongWaitingRow>("/external/waitings", query, undefined, pageLimit, exactTotals)
      : Promise.resolve(emptyCollection<DidongWaitingRow>()),
    options.surveys
      ? fetchByCenter<DidongSurveyRow>("/external/surveys", query, undefined, pageLimit, exactTotals)
      : Promise.resolve(emptyCollection<DidongSurveyRow>()),
    options.coupons
      ? fetchByCenter<DidongCouponRow>("/external/coupons", query, undefined, pageLimit, false)
      : Promise.resolve(emptyCollection<DidongCouponRow>()),
    options.websiteVisitors
      ? fetchByMonth<DidongWebsiteVisitorRow>(
        "/external/websiteVisitors",
        query,
        undefined,
        pageLimit
      )
      : Promise.resolve(emptyCollection<DidongWebsiteVisitorRow>()),
    options.websiteStats
      ? fetchByMonth<DidongWebsiteStatsRow>(
        "/external/websiteVisitors/stats",
        query,
        undefined,
        pageLimit
      )
      : Promise.resolve(emptyCollection<DidongWebsiteStatsRow>()),
  ]);

  return {
    totals,
    visits,
    waitings,
    surveys,
    coupons,
    websiteVisitors,
    websiteStats,
    fetchedAt: new Date().toISOString(),
  };
}
