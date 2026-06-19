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

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

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
  bypassCache = false
): Promise<ApiCollection<T>> {
  const cacheKey = `${path}:${JSON.stringify(params)}`;
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
    const response = await didongGet<T>(path, { ...params, page });
    data.push(...(response.data ?? []));
    latestMeta = response.meta;
    lastPage = response.meta?.last_page ?? page;
    page += 1;
  } while (page <= lastPage);

  const value: ApiCollection<T> = {
    data,
    total: latestMeta?.total ?? data.length,
    meta: latestMeta,
  };
  memoryCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function safeFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  bypassCache: boolean | undefined
): Promise<ApiCollection<T>> {
  try {
    return await fetchAllPages<T>(path, params, bypassCache);
  } catch (error) {
    return {
      data: [],
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function selectedCenters(center: V2Query["center"]) {
  if (center === "ALL") return V2_CENTERS;
  return V2_CENTERS.filter((item) => item.code === center);
}

async function fetchByCenter<T>(
  path: string,
  query: V2Query,
  extra?: Record<string, string | number | undefined>
) {
  const chunks = [];
  for (const center of selectedCenters(query.center)) {
    chunks.push(
      await safeFetch<T>(
        path,
        {
          center_type: center.code,
          started_at: query.startDate,
          finished_at: query.endDate,
          ...extra,
        },
        query.bypassCache
      )
    );
  }

  return {
    data: chunks.flatMap((chunk) => chunk.data),
    total: chunks.reduce((sum, chunk) => sum + chunk.total, 0),
    error: chunks.map((chunk) => chunk.error).filter(Boolean).join("\n") || undefined,
  } satisfies ApiCollection<T>;
}

export async function fetchDashboardV2Sources(query: V2Query) {
  const totals = await fetchByCenter<DidongTotalRow>("/external/total", query);
  const visits = await fetchByCenter<DidongVisitRow>("/external/visits", query);
  const waitings = await fetchByCenter<DidongWaitingRow>("/external/waitings", query);
  const surveys = await fetchByCenter<DidongSurveyRow>("/external/surveys", query);
  const coupons = await fetchByCenter<DidongCouponRow>("/external/coupons", query);
  const websiteVisitors = await safeFetch<DidongWebsiteVisitorRow>(
    "/external/websiteVisitors",
    { started_at: query.startDate, finished_at: query.endDate },
    query.bypassCache
  );
  const websiteStats = await safeFetch<DidongWebsiteStatsRow>(
    "/external/websiteVisitors/stats",
    { started_at: query.startDate, finished_at: query.endDate },
    query.bypassCache
  );

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
