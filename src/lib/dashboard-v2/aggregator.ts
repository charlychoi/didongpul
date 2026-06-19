import { maskContact, maskIp, maskName } from "./privacy";
import {
  ChartPoint,
  DidongSurveyRow,
  DidongTotalRow,
  DidongVisitRow,
  V2_CENTERS,
  V2Query,
  V2SourceBundle,
} from "./types";

const CENTER_NAME_BY_CODE = new Map(V2_CENTERS.map((center) => [String(center.code), center.name]));
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function asNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value?: string | null) {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : "미상";
}

function centerName(row: { center_type?: string | number | null; format_center_type?: string | null }) {
  return row.format_center_type || CENTER_NAME_BY_CODE.get(String(row.center_type)) || "미상";
}

function userKey(row: DidongTotalRow | DidongVisitRow | DidongSurveyRow) {
  const user = row.user;
  const contact = "contact" in row ? row.contact : null;
  const name = "name" in row ? row.name : null;
  return (
    user?.id?.toString() ||
    user?.uuid ||
    user?.contact ||
    contact ||
    [name, row.entered_at, row.center_type].filter(Boolean).join("|") ||
    "unknown"
  );
}

function ageBucket(value: unknown) {
  const age = asNumber(value);
  if (age == null) return "미상";
  if (age < 50) return "40대 이하";
  if (age < 60) return "50대";
  if (age < 70) return "60대";
  if (age < 80) return "70대";
  return "80대 이상";
}

function genderLabel(value?: string | null) {
  const text = (value || "").trim().toLowerCase();
  if (["m", "male", "남", "남성"].includes(text)) return "남성";
  if (["f", "female", "여", "여성"].includes(text)) return "여성";
  return "미상";
}

function score(value: unknown) {
  const numeric = asNumber(value);
  if (numeric != null && numeric >= 1 && numeric <= 5) return numeric;
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.includes("매우 불만") || text.includes("전혀")) return 1;
  if (text.includes("불만") || text.includes("그렇지 않다")) return 2;
  if (text.includes("보통")) return 3;
  if (text.includes("매우") || text.includes("아주")) return 5;
  if (text.includes("만족") || text.includes("그렇다") || text.includes("좋다")) return 4;
  return null;
}

function isPositive(value: unknown) {
  const numeric = asNumber(value);
  if (numeric != null) return numeric >= 4;
  const text = String(value ?? "").trim();
  return ["예", "있음", "있다", "그렇다", "매우 그렇다", "재방문 의향 있음"].some((word) =>
    text.includes(word)
  );
}

function stayMinutes(row: { entered_at?: string | null; leaved_at?: string | null }) {
  const entered = parseDate(row.entered_at);
  const left = parseDate(row.leaved_at);
  if (!entered || !left) return null;
  return Math.round((left.getTime() - entered.getTime()) / 60_000);
}

function inc(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function toPoints(map: Map<string, number>, limit?: number): ChartPoint[] {
  const rows = Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  return limit ? rows.slice(0, limit) : rows;
}

function splitProgramNames(value?: string | null) {
  return (value || "")
    .split(/[,/;\n]/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function avg(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value != null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function previousRange(query: V2Query) {
  const start = parseDate(query.startDate);
  const end = parseDate(query.endDate);
  if (!start || !end) return null;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);
  return {
    startDate: prevStart.toISOString().slice(0, 10),
    endDate: prevEnd.toISOString().slice(0, 10),
  };
}

export function makeEmptyV2Result(query: V2Query) {
  return buildDashboardV2(query, {
    totals: { data: [], total: 0 },
    visits: { data: [], total: 0 },
    waitings: { data: [], total: 0 },
    surveys: { data: [], total: 0 },
    coupons: { data: [], total: 0 },
    websiteVisitors: { data: [], total: 0 },
    websiteStats: { data: [], total: 0 },
    fetchedAt: new Date().toISOString(),
  });
}

export function buildDashboardV2(query: V2Query, source: V2SourceBundle) {
  const visitRows = source.visits.data.length ? source.visits.data : source.totals.data;
  const surveyRows = source.surveys.data.length ? source.surveys.data : source.totals.data;
  const userVisitCounts = new Map<string, number>();
  const dailyVisits = new Map<string, number>();
  const centerVisits = new Map<string, number>();
  const centerUnique = new Map<string, Set<string>>();
  const centerStayValues = new Map<string, number[]>();
  const centerSurveys = new Map<string, { visits: number; surveys: number; satisfaction: number[]; revisit: number; responses: number }>();
  const hourlyEntries = new Map<string, number>();
  const hourlyLeaves = new Map<string, number>();
  const hourlyOccupancy = new Map<string, number>();
  const weekdayVisits = new Map<string, number>();
  const ageDistribution = new Map<string, number>();
  const genderDistribution = new Map<string, number>();
  const locationDistribution = new Map<string, number>();
  const visitCountDistribution = new Map<string, number>();
  const inflowDistribution = new Map<string, number>();
  const centerAgeHeatmap: Array<Record<string, string | number>> = [];

  let invalidStayCount = 0;
  let noExitCount = 0;
  let missingUserCount = 0;
  let missingContactCount = 0;
  let surveyMissingCount = 0;
  const stayValues: number[] = [];

  for (const row of visitRows) {
    const key = userKey(row);
    const center = centerName(row);
    userVisitCounts.set(key, (userVisitCounts.get(key) ?? 0) + 1);
    inc(dailyVisits, dateKey(row.entered_at));
    inc(centerVisits, center);
    if (!centerUnique.has(center)) centerUnique.set(center, new Set());
    centerUnique.get(center)!.add(key);

    const entered = parseDate(row.entered_at);
    const left = parseDate(row.leaved_at);
    if (entered) {
      inc(hourlyEntries, `${entered.getHours()}시`);
      inc(weekdayVisits, WEEKDAYS[entered.getDay()]);
    }
    if (left) inc(hourlyLeaves, `${left.getHours()}시`);
    if (!left) noExitCount += 1;
    if (!row.user && !(row as DidongTotalRow).name) missingUserCount += 1;

    const minutes = stayMinutes(row);
    if (minutes != null) {
      if (minutes < 0 || minutes > 480) {
        invalidStayCount += 1;
      } else {
        stayValues.push(minutes);
        if (!centerStayValues.has(center)) centerStayValues.set(center, []);
        centerStayValues.get(center)!.push(minutes);
      }
    }

    const age = row.user?.age ?? (row as DidongTotalRow).age;
    const gender = row.user?.gender ?? (row as DidongTotalRow).gender;
    const location = row.user?.location ?? (row as DidongTotalRow).location;
    const contact = row.user?.contact ?? (row as DidongTotalRow).contact;
    if (!contact) missingContactCount += 1;
    inc(ageDistribution, ageBucket(age));
    inc(genderDistribution, genderLabel(gender));
    inc(locationDistribution, location?.trim() || "미상");

    for (let hour = 9; hour <= 18; hour++) {
      const start = new Date(entered ?? 0);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setMinutes(59, 59, 999);
      if (entered && entered <= end && (!left || left >= start)) inc(hourlyOccupancy, `${hour}시`);
    }
  }

  for (const count of userVisitCounts.values()) {
    if (count === 1) inc(visitCountDistribution, "첫 방문");
    else if (count <= 3) inc(visitCountDistribution, "2~3회");
    else if (count <= 5) inc(visitCountDistribution, "4~5회");
    else if (count <= 10) inc(visitCountDistribution, "6~10회");
    else inc(visitCountDistribution, "11회 이상");
  }

  const surveyScores = {
    program: [] as number[],
    operation: [] as number[],
    help: [] as number[],
    total: [] as number[],
  };
  let revisitPositive = 0;
  const programLike = new Map<string, number>();

  for (const row of surveyRows) {
    const center = centerName(row);
    const centerBucket =
      centerSurveys.get(center) ?? { visits: 0, surveys: 0, satisfaction: [], revisit: 0, responses: 0 };
    centerBucket.surveys += 1;
    centerBucket.responses += 1;
    if (isPositive(row.revisit)) {
      revisitPositive += 1;
      centerBucket.revisit += 1;
    }

    const programScore = score(row.program_satisfaction);
    const operationScore = score(row.operate_satisfaction);
    const helpScore = score(row.help_it_satisfaction);
    const totalScore = avg([programScore, operationScore, helpScore]);
    if (programScore != null) surveyScores.program.push(programScore);
    if (operationScore != null) surveyScores.operation.push(operationScore);
    if (helpScore != null) surveyScores.help.push(helpScore);
    if (totalScore != null) {
      surveyScores.total.push(totalScore);
      centerBucket.satisfaction.push(totalScore);
    }
    centerSurveys.set(center, centerBucket);

    inc(inflowDistribution, row.format_way_to_come || row.way_to_come || "미응답");
    for (const name of splitProgramNames(row.format_most_like || row.most_like)) inc(programLike, name);
  }

  for (const row of source.totals.data) {
    if (!row.survey_created_at) surveyMissingCount += 1;
  }

  const programApplications = new Map<string, number>();
  const programCompletions = new Map<string, number>();
  const programWaiting = new Map<string, number>();
  const programOrderValues = new Map<string, number[]>();

  for (const row of source.waitings.data) {
    const title = row.program?.title?.trim() || "미상";
    inc(programApplications, title);
    const state = `${row.format_state || row.state || ""}`;
    if (state.includes("완료") || row.finished_at) inc(programCompletions, title);
    const waiting = asNumber(row.program?.countWaiting) ?? asNumber(row.current) ?? 0;
    if (waiting > 0) inc(programWaiting, title, waiting);
    const order = asNumber(row.order);
    if (order != null) {
      if (!programOrderValues.has(title)) programOrderValues.set(title, []);
      programOrderValues.get(title)!.push(order);
    }
  }

  const websiteDaily = new Map<string, number>();
  const websiteSources = new Map<string, number>();
  for (const row of source.websiteStats.data) {
    const count = asNumber(row.count) ?? asNumber(row.total) ?? asNumber(row.visitors) ?? 1;
    inc(websiteDaily, row.date || dateKey(row.visited_at), count);
    inc(websiteSources, row.source || row.referer || "직접/미상", count);
  }
  for (const row of source.websiteVisitors.data) {
    inc(websiteDaily, dateKey(row.visited_at || row.created_at));
    inc(websiteSources, row.source || row.referer || "직접/미상");
  }

  const linkedWebsiteUsers = new Set(
    source.websiteVisitors.data
      .map((row) => row.user_id?.toString() || row.user?.id?.toString())
      .filter((value): value is string => Boolean(value))
  );
  const visitUsers = new Set(
    visitRows
      .map((row) => row.user?.id?.toString())
      .filter((value): value is string => Boolean(value))
  );
  const convertedUsers = [...linkedWebsiteUsers].filter((userId) => visitUsers.has(userId)).length;

  const couponNotUsed =
    source.coupons.meta?.counts_not_use ??
    source.coupons.data.filter((row) => !row.used_at).length;

  for (const center of V2_CENTERS) {
    const row: Record<string, string | number> = { center: center.name };
    for (const age of ["40대 이하", "50대", "60대", "70대", "80대 이상", "미상"]) {
      row[age] = visitRows.filter((item) => centerName(item) === center.name && ageBucket(item.user?.age ?? (item as DidongTotalRow).age) === age).length;
    }
    centerAgeHeatmap.push(row);
  }

  const uniqueUsers = userVisitCounts.size;
  const revisitUsers = [...userVisitCounts.values()].filter((count) => count >= 2).length;
  const totalVisits = visitRows.length;
  const surveyResponses = surveyRows.length;
  const satisfactionAverage = avg(surveyScores.total);
  const apiErrors = [
    source.totals.error,
    source.visits.error,
    source.waitings.error,
    source.surveys.error,
    source.coupons.error,
    source.websiteVisitors.error,
    source.websiteStats.error,
  ].filter(Boolean);

  const centers = V2_CENTERS.map((center) => {
    const name = center.name;
    const centerSurvey = centerSurveys.get(name);
    const visits = centerVisits.get(name) ?? 0;
    return {
      center: name,
      visits,
      uniqueUsers: centerUnique.get(name)?.size ?? 0,
      avgStayMinutes: Math.round(avg(centerStayValues.get(name) ?? []) ?? 0),
      surveyResponseRate: percent(centerSurvey?.surveys ?? 0, visits),
      satisfaction: Math.round((avg(centerSurvey?.satisfaction ?? []) ?? 0) * 10) / 10,
      revisitIntentRate: percent(centerSurvey?.revisit ?? 0, centerSurvey?.responses ?? 0),
      programCompletions: source.waitings.data.filter((row) => centerName({
        center_type: row.program?.center_type,
        format_center_type: row.program?.format_center_type,
      }) === name && (row.finished_at || `${row.format_state || row.state || ""}`.includes("완료"))).length,
    };
  });

  const operationsRows = visitRows.slice(0, 30).map((row) => ({
    center: centerName(row),
    name: maskName(row.user?.name ?? (row as DidongTotalRow).name),
    contact: maskContact(row.user?.contact ?? (row as DidongTotalRow).contact),
    enteredAt: row.entered_at || "",
    leavedAt: row.leaved_at || "",
    issue: !row.leaved_at ? "미퇴장" : stayMinutes(row) != null && (stayMinutes(row)! < 0 || stayMinutes(row)! > 480) ? "비정상 체류" : "점검",
  }));

  const websiteRows = source.websiteVisitors.data.slice(0, 20).map((row) => ({
    source: row.source || row.referer || "직접/미상",
    visitedAt: row.visited_at || row.created_at || "",
    user: row.user_id ? `회원 ${row.user_id}` : "비회원/미상",
    ip: maskIp(row.ip_address),
  }));

  return {
    period: { start: query.startDate, end: query.endDate, previous: previousRange(query) },
    filters: { center: query.center },
    sync: {
      lastFetchedAt: source.fetchedAt,
      source: "didong external API",
      apiErrors,
      partial: apiErrors.length > 0,
    },
    kpis: {
      totalVisits,
      uniqueUsers,
      newUsers: Math.max(0, uniqueUsers - revisitUsers),
      revisitUsers,
      revisitRate: percent(revisitUsers, uniqueUsers),
      avgStayMinutes: Math.round(avg(stayValues) ?? 0),
      surveyResponses,
      surveyResponseRate: percent(surveyResponses, totalVisits),
      avgSatisfaction: Math.round((satisfactionAverage ?? 0) * 10) / 10,
      revisitIntentRate: percent(revisitPositive, surveyResponses),
      programCompletions: [...programCompletions.values()].reduce((sum, value) => sum + value, 0),
      couponNotUsed,
    },
    charts: {
      dailyVisits: Array.from(dailyVisits.entries()).sort().map(([name, value]) => ({ name, value })),
      centerVisits: centers.map((item) => ({ name: item.center, value: item.visits, uniqueUsers: item.uniqueUsers })),
      hourly: Array.from({ length: 10 }, (_, index) => {
        const hour = `${index + 9}시`;
        return {
          name: hour,
          입장: hourlyEntries.get(hour) ?? 0,
          퇴장: hourlyLeaves.get(hour) ?? 0,
          체류: hourlyOccupancy.get(hour) ?? 0,
        };
      }),
      weekdays: WEEKDAYS.map((name) => ({ name, value: weekdayVisits.get(name) ?? 0 })),
      ageDistribution: toPoints(ageDistribution),
      genderDistribution: toPoints(genderDistribution),
      locationDistribution: toPoints(locationDistribution, 10),
      visitCountDistribution: toPoints(visitCountDistribution),
      inflowDistribution: toPoints(inflowDistribution, 10),
      programApplications: toPoints(programApplications, 10),
      programCompletions: toPoints(programCompletions, 10),
      programWaiting: toPoints(programWaiting, 10),
      programAverageOrder: Array.from(programOrderValues.entries()).map(([name, values]) => ({
        name,
        value: Math.round(avg(values) ?? 0),
      })).sort((a, b) => b.value - a.value).slice(0, 10),
      programLikes: toPoints(programLike, 10),
      satisfactionBars: [
        { name: "프로그램", value: Math.round((avg(surveyScores.program) ?? 0) * 10) / 10 },
        { name: "운영", value: Math.round((avg(surveyScores.operation) ?? 0) * 10) / 10 },
        { name: "도움", value: Math.round((avg(surveyScores.help) ?? 0) * 10) / 10 },
      ],
      satisfactionTrend: Array.from(
        surveyRows.reduce((map, row) => {
          const createdAt = (row as { created_at?: string | null }).created_at;
          const key = dateKey(createdAt || row.survey_created_at);
          const value = avg([score(row.program_satisfaction), score(row.operate_satisfaction), score(row.help_it_satisfaction)]);
          if (value == null) return map;
          map.set(key, [...(map.get(key) ?? []), value]);
          return map;
        }, new Map<string, number[]>())
      ).sort().map(([name, values]) => ({ name, value: Math.round((avg(values) ?? 0) * 10) / 10 })),
      websiteDaily: Array.from(websiteDaily.entries()).sort().map(([name, value]) => ({ name, value })),
      websiteSources: toPoints(websiteSources, 10),
      centerAgeHeatmap,
    },
    centers,
    marketing: {
      linkedWebsiteUsers: linkedWebsiteUsers.size,
      convertedUsers,
      conversionRate: percent(convertedUsers, linkedWebsiteUsers.size),
      websiteRows,
    },
    operations: {
      noExitCount,
      missingUserCount,
      surveyMissingCount,
      invalidStayCount,
      missingContactCount,
      couponNotUsed,
      apiFailureCount: apiErrors.length,
      rows: operationsRows,
    },
  };
}
