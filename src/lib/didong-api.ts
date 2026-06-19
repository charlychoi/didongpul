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

async function fetchPage<T>(
  path: string,
  params: Record<string, string | number>
): Promise<PagedResponse<T>> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const url = `${BASE_URL}${path}?${qs}`;
  const res = await fetch(url, {
    headers: { "X-API-KEY": API_KEY },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`didong API ${path} 오류: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function fetchAllVisits(
  centerCode: CenterCode,
  startedAt: string,
  finishedAt: string
): Promise<DidongVisit[]> {
  const results: DidongVisit[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const resp = await fetchPage<DidongVisit>("/external/visits", {
      center_type: centerCode,
      started_at: startedAt,
      finished_at: finishedAt,
      page,
    });
    results.push(...resp.data);
    lastPage = resp.meta.last_page;
    page++;
  } while (page <= lastPage);
  return results;
}

export async function fetchAllSurveys(
  centerCode: CenterCode,
  startedAt: string,
  finishedAt: string
): Promise<DidongSurvey[]> {
  const results: DidongSurvey[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const resp = await fetchPage<DidongSurvey>("/external/surveys", {
      center_type: centerCode,
      started_at: startedAt,
      finished_at: finishedAt,
      page,
    });
    results.push(...resp.data);
    lastPage = resp.meta.last_page;
    page++;
  } while (page <= lastPage);
  return results;
}

export async function fetchAllWaitings(
  centerCode: CenterCode,
  startedAt: string,
  finishedAt: string
): Promise<DidongWaiting[]> {
  const results: DidongWaiting[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const resp = await fetchPage<DidongWaiting>("/external/waitings", {
      center_type: centerCode,
      started_at: startedAt,
      finished_at: finishedAt,
      page,
    });
    results.push(...resp.data);
    lastPage = resp.meta.last_page;
    page++;
  } while (page <= lastPage);
  return results;
}
