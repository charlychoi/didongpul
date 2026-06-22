export const V3_CENTERS = [
  { code: 2, name: "강동센터", color: "#2563eb" },
  { code: 3, name: "도봉센터", color: "#16a34a" },
  { code: 4, name: "동대문센터", color: "#f59e0b" },
] as const;

export type V3CenterCode = (typeof V3_CENTERS)[number]["code"];

export type V3CenterFilter = V3CenterCode | "ALL";

export interface V3Query {
  startDate: string;
  endDate: string;
  center: V3CenterFilter;
  bypassCache?: boolean;
}

export interface DidongUser {
  id?: number | string | null;
  uuid?: string | null;
  name?: string | null;
  contact?: string | null;
  age?: string | number | null;
  gender?: string | null;
  location?: string | null;
}

export interface DidongTotalRow {
  id?: number | string | null;
  user?: DidongUser | null;
  center_type?: string | number | null;
  format_center_type?: string | null;
  name?: string | null;
  contact?: string | null;
  gender?: string | null;
  age?: string | number | null;
  location?: string | null;
  entered_at?: string | null;
  leaved_at?: string | null;
  survey_created_at?: string | null;
  way_to_come?: string | null;
  format_way_to_come?: string | null;
  program_satisfaction?: string | number | null;
  operate_satisfaction?: string | number | null;
  help_it_satisfaction?: string | number | null;
  revisit?: string | number | null;
  programs?: string | null;
  format_programs?: string | null;
  most_like?: string | null;
  format_most_like?: string | null;
  count_visit?: string | number | null;
}

export interface DidongVisitRow {
  id?: number | string | null;
  user?: DidongUser | null;
  center_type?: string | number | null;
  format_center_type?: string | null;
  entered_at?: string | null;
  leaved_at?: string | null;
}

export interface DidongWaitingRow {
  id?: number | string | null;
  uuid?: string | null;
  center_type?: string | number | null;
  format_center_type?: string | null;
  program?: {
    id?: number | string | null;
    center_type?: string | number | null;
    format_center_type?: string | null;
    title?: string | null;
    countWaiting?: number | string | null;
  } | null;
  user?: DidongUser | null;
  state?: string | null;
  format_state?: string | null;
  order?: number | string | null;
  current?: number | string | null;
  finished_at?: string | null;
  created_at?: string | null;
}

export interface DidongSurveyRow extends DidongTotalRow {
  id?: number | string | null;
  created_at?: string | null;
}

export interface DidongCouponRow {
  id?: number | string | null;
  center_type?: string | number | null;
  format_center_type?: string | null;
  user?: DidongUser | null;
  used_at?: string | null;
  give_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DidongWebsiteVisitorRow {
  id?: number | string | null;
  user_id?: number | string | null;
  user?: DidongUser | null;
  source?: string | null;
  referer?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  visited_at?: string | null;
  created_at?: string | null;
}

export interface DidongWebsiteStatsRow {
  date?: string | null;
  visited_at?: string | null;
  source?: string | null;
  referer?: string | null;
  count?: number | string | null;
  total?: number | string | null;
  visitors?: number | string | null;
}

export interface PagedResponse<T> {
  data: T[];
  links?: { next?: string | null };
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    counts_not_use?: number;
  };
}

export interface ApiCollection<T> {
  data: T[];
  total: number;
  centerTotals?: Record<string, number>;
  meta?: PagedResponse<T>["meta"];
  error?: string;
  truncated?: boolean;
}

export interface V3SourceBundle {
  totals: ApiCollection<DidongTotalRow>;
  cumulativeTotals?: ApiCollection<DidongTotalRow>;
  visits: ApiCollection<DidongVisitRow>;
  waitings: ApiCollection<DidongWaitingRow>;
  surveys: ApiCollection<DidongSurveyRow>;
  coupons: ApiCollection<DidongCouponRow>;
  websiteVisitors: ApiCollection<DidongWebsiteVisitorRow>;
  websiteStats: ApiCollection<DidongWebsiteStatsRow>;
  fetchedAt: string;
}

export interface ChartPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}
