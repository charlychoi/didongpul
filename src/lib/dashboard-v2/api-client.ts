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
  V2_CENTERS,
  V2Query,
} from "./types";

const DEFAULT_BASE_URL = "https://api.didong.kr/api";
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_PAGES = 500;
const MIN_REQUEST_GAP_MS = 450;
const DASHBOARD_PAGE_LIMIT = 10;
const DEFAULT_PER_PAGE = 100;

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

export interface DashboardV2SourceOptions {
  totals?: boolean;
  visits?: boolean;
  waitings?: boolean;
  surveys?: boolean;
  coupons?: boolean;
  websiteVisitors?: boolean;
  websiteStats?: boolean;
  pageLimit?: number;
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
    windows.push({
      startDate: cursor < startDate ? startDate : cursor,
      endDate: monthEnd(cursor) > endDate ? endDate : monthEnd(cursor),
    });
    cursor = addMonth(cursor);
  }
  return windows;
}

function rowDate(row: unknown) {
  const item = row as Record<string, unknown>;
  const value =
    item.entered_at ??
    item.created_at ??
    item.visited_at ??
    item.survey_created_at ??
    item.finished_at ??
    item.used_at ??
    item.date;
  if (typeof value !== "string") return null;
  const parsed = parseDate(value);
  return parsed ? dateOnly(parsed) : null;
}

function filterRowsByDate<T>(rows: T[], query: V2Query) {
  return rows.filter((row) => {
    const date = rowDate(row);
    return !date || (date >= query.startDate && date <= query.endDate);
  });
}

function mergeCollections<T>(collections: ApiCollection<T>[], query: V2Query): ApiCollection<T> {
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
  return {
    data,
    total: collections.reduce((sum, collection) => sum + collection.total, 0),
    meta: collections.at(-1)?.meta,
    truncated: collections.some((collection) => collection.truncated),
    error: errors.join("\n") || undefined,
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
  const cached = memoryCache.get(cacheKey);
  if (!bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.value as ApiCollection<T>;
  }

  const data: T[] = [];
  let page = 1;
  let lastPage = 1;
  let latestMeta: PagedResponse<T>["meta"] | undefined;

  do {
    if (page > MAX_PAGES) throw new Error(`${path}: 페이지 수가 비정상적으로 많습니다.`);
    const response = await didongGet<T>(path, { per_page: DEFAULT_PER_PAGE, ...params, page });
    data.push(...(response.data ?? []));
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
  memoryCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
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

function selectedCenters(center: V2Query["center"]) {
  if (center === "ALL") return V2_CENTERS;
  return V2_CENTERS.filter((item) => item.code === center);
}

async function fetchByCenter<T>(
  path: string,
  query: V2Query,
  extra?: Record<string, string | number | undefined>,
  pageLimit = DASHBOARD_PAGE_LIMIT
) {
  const chunks = [];
  const windows = monthWindows(query.startDate, query.endDate);
  for (const center of selectedCenters(query.center)) {
    for (const window of windows) {
      chunks.push(
        await safeFetch<T>(
          path,
          {
            center_type: center.code,
            started_at: window.startDate,
            finished_at: window.endDate,
            ...extra,
          },
          query.bypassCache,
          pageLimit
        )
      );
    }
  }

  return mergeCollections(chunks, query);
}

async function fetchByMonth<T>(
  path: string,
  query: V2Query,
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

export async function fetchDashboardV2Sources(
  query: V2Query,
  options: DashboardV2SourceOptions = {
    totals: true,
    visits: true,
    waitings: true,
    surveys: true,
    coupons: true,
    websiteVisitors: true,
    websiteStats: true,
  }
) {
  const pageLimit = options.pageLimit ?? DASHBOARD_PAGE_LIMIT;
  const totals = options.totals
    ? await fetchByCenter<DidongTotalRow>("/external/total", query, undefined, pageLimit)
    : emptyCollection<DidongTotalRow>();
  const visits = options.visits
    ? await fetchByCenter<DidongVisitRow>("/external/visits", query, undefined, pageLimit)
    : emptyCollection<DidongVisitRow>();
  const waitings = options.waitings
    ? await fetchByCenter<DidongWaitingRow>("/external/waitings", query, undefined, pageLimit)
    : emptyCollection<DidongWaitingRow>();
  const surveys = options.surveys
    ? await fetchByCenter<DidongSurveyRow>("/external/surveys", query, undefined, pageLimit)
    : emptyCollection<DidongSurveyRow>();
  const coupons = options.coupons
    ? await fetchByCenter<DidongCouponRow>("/external/coupons", query, undefined, pageLimit)
    : emptyCollection<DidongCouponRow>();
  const websiteVisitors = options.websiteVisitors
    ? await fetchByMonth<DidongWebsiteVisitorRow>(
      "/external/websiteVisitors",
      query,
      undefined,
      pageLimit
    )
    : emptyCollection<DidongWebsiteVisitorRow>();
  const websiteStats = options.websiteStats
    ? await fetchByMonth<DidongWebsiteStatsRow>(
      "/external/websiteVisitors/stats",
      query,
      undefined,
      pageLimit
    )
    : emptyCollection<DidongWebsiteStatsRow>();

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
