const BASE_URL = "https://api.didong.kr/api";
const API_KEY = process.env.DIDONG_API_KEY ?? "";

// 대시보드 대상 센터만 (영등포·은평 제외)
export const DIDONG_CENTERS = [
  { code: 2, name: "강동센터" },
  { code: 3, name: "도봉센터" },
  { code: 4, name: "동대문센터" },
] as const;

export type CenterCode = 2 | 3 | 4;

export interface DidongVisit {
  id: number;
  user: {
    id: number;
    uuid: string;
    name: string;
    contact: string;
    age: string;
    gender: string;
    location: string;
  } | null;
  center_type: string;
  format_center_type: string;
  entered_at: string;
  leaved_at: string;
}

export interface DidongSurvey {
  id: number;
  user: { id: number; name: string; contact: string } | null;
  center_type: string;
  format_center_type: string;
  gender: string;
  age: string;
  location: string;
  way_to_come: string;
  format_way_to_come: string;
  count_visit: string | number;
  programs: string;
  format_programs: string;
  most_like: string;
  format_most_like: string;
  program_satisfaction: string | number;
  operate_satisfaction: string | number;
  help_it_satisfaction: string | number;
  revisit: string;
  created_at: string;
}

export interface DidongWaiting {
  id: number;
  uuid: string;
  program: {
    id: number;
    center_type: string;
    format_center_type: string;
    title: string;
  } | null;
  user: { id: number; name: string; contact: string } | null;
  state: string;
  format_state: string;
  finished_at: string;
  created_at: string;
}

interface PagedResponse<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage<T>(
  path: string,
  params: Record<string, string | number>
): Promise<PagedResponse<T>> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const url = `${BASE_URL}${path}?${qs}`;

  // 429 발생 시 최대 3회 재시도 (지수 백오프)
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { "X-API-KEY": API_KEY },
      next: { revalidate: 0 },
    });
    if (res.status === 429) {
      const wait = 2000 * (attempt + 1); // 2s, 4s, 6s
      await delay(wait);
      continue;
    }
    if (!res.ok) {
      throw new Error(`didong API ${path} 오류: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
  throw new Error(`didong API ${path} rate limit 초과 (429)`);
}

async function fetchAll<T>(
  path: string,
  baseParams: Record<string, string | number>
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const resp = await fetchPage<T>(path, { ...baseParams, page });
    results.push(...resp.data);
    lastPage = resp.meta.last_page;
    page++;
    if (page <= lastPage) await delay(500); // 페이지 간 500ms 간격
  } while (page <= lastPage);
  return results;
}

export async function fetchAllVisits(
  centerCode: CenterCode,
  startedAt: string,
  finishedAt: string
): Promise<DidongVisit[]> {
  return fetchAll<DidongVisit>("/external/visits", {
    center_type: centerCode,
    started_at: startedAt,
    finished_at: finishedAt,
  });
}

export async function fetchAllSurveys(
  centerCode: CenterCode,
  startedAt: string,
  finishedAt: string
): Promise<DidongSurvey[]> {
  return fetchAll<DidongSurvey>("/external/surveys", {
    center_type: centerCode,
    started_at: startedAt,
    finished_at: finishedAt,
  });
}

export async function fetchAllWaitings(
  centerCode: CenterCode,
  startedAt: string,
  finishedAt: string
): Promise<DidongWaiting[]> {
  return fetchAll<DidongWaiting>("/external/waitings", {
    center_type: centerCode,
    started_at: startedAt,
    finished_at: finishedAt,
  });
}
