import { maskContact, maskIp, maskName } from "./privacy";
import {
  ChartPoint,
  DidongCouponRow,
  DidongSurveyRow,
  DidongTotalRow,
  DidongVisitRow,
  DidongWaitingRow,
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
  const datePart = value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (datePart) return datePart;
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : "미상";
}

function centerName(row: { center_type?: string | number | null; format_center_type?: string | null }) {
  return row.format_center_type || CENTER_NAME_BY_CODE.get(String(row.center_type)) || "미상";
}

function selectedOfficialCenters(center: V2Query["center"]) {
  if (center === "ALL") return V2_CENTERS;
  return V2_CENTERS.filter((item) => item.code === center);
}

function userKey(row: DidongTotalRow | DidongVisitRow | DidongSurveyRow) {
  const user = row.user;
  const contact = "contact" in row ? row.contact : null;
  const name = "name" in row ? row.name : null;
  const normalizedName = String(user?.name ?? name ?? "").replace(/\s+/g, "").trim();
  const normalizedContact = String(user?.contact ?? contact ?? "").replace(/\D/g, "");
  if (normalizedName && normalizedContact) return `${normalizedName}${normalizedContact}`;
  if (normalizedContact) return normalizedContact;
  return (
    user?.id?.toString() ||
    user?.uuid ||
    [normalizedName, row.entered_at, row.center_type].filter(Boolean).join("|") ||
    "unknown"
  );
}

function visitEventKey(row: DidongTotalRow | DidongVisitRow | DidongSurveyRow) {
  return `${userKey(row)}|${centerName(row)}|${dateKey(row.entered_at)}`;
}

function monthKey(value?: string | null) {
  return dateKey(value).slice(0, 7);
}

function monthVisitorKey(row: DidongTotalRow | DidongVisitRow | DidongSurveyRow) {
  return userKey(row);
}

function isFirstVisitLabel(value: unknown) {
  const numeric = asNumber(value);
  if (numeric != null) return numeric <= 1;
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.includes("첫")) return true;
  if (text.includes("2") || text.includes("3") || text.includes("4") || text.includes("5") || text.includes("이상")) {
    return false;
  }
  return null;
}

function visitCountBucket(value: unknown, fallbackCount: number, hasCountVisitHistory = false) {
  const text = String(value ?? "").trim();
  if (!text && hasCountVisitHistory) return "횟수 미상";
  if (text.includes("첫")) return "첫 방문";
  if (text.includes("2") || text.includes("3")) return "2~3회";
  if (text.includes("4") || text.includes("5")) return "4~5회";
  if (text.includes("6") || text.includes("7") || text.includes("8") || text.includes("9") || text.includes("10")) {
    return "6~10회";
  }
  if (text.includes("이상")) return "11회 이상";
  if (fallbackCount === 1) return "첫 방문";
  if (fallbackCount <= 3) return "2~3회";
  if (fallbackCount <= 5) return "4~5회";
  if (fallbackCount <= 10) return "6~10회";
  return "11회 이상";
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

function ageDecadeLabel(value: unknown) {
  const age = asNumber(value);
  if (age == null) return "미상";
  if (age < 20) return "10대 이하";
  if (age >= 90) return "90대";
  return `${Math.floor(age / 10) * 10}대`;
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
    cumulativeTotals: { data: [], total: 0 },
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
  const cumulativeRows = source.cumulativeTotals?.data.length ? source.cumulativeTotals.data : source.totals.data;
  const surveyRows = source.surveys.data.length ? source.surveys.data : source.totals.data;
  const countVisitByEvent = new Map<string, unknown>();
  for (const row of source.totals.data) {
    const key = visitEventKey(row);
    const isFirst = isFirstVisitLabel(row.count_visit);
    if (isFirst === false || !countVisitByEvent.has(key)) {
      countVisitByEvent.set(key, row.count_visit);
    }
  }
  const dailyCenterVisitKeys = new Set<string>();
  const dailyCenterVisitCounts = new Map<string, number>();
  const dedupedVisitRows: typeof visitRows = [];
  const dailyVisits = new Map<string, number>();
  const centerVisits = new Map<string, number>();
  const centerUnique = new Map<string, Set<string>>();
  const centerMonthlyUnique = new Map<string, Set<string>>();
  const centerMonthlyUniqueCount = new Map<string, number>();
  const centerCumulativeDailyVisits = new Map<string, number>();
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
  let firstVisitEvents = 0;
  let revisitVisitEvents = 0;
  const stayValues: number[] = [];
  const selectedMonth = monthKey(query.startDate);
  const cumulativeDailyKeys = new Set<string>();
  const monthlyUniqueKeys = new Set<string>();

  for (const row of cumulativeRows) {
    const center = centerName(row);
    const dailyKey = visitEventKey(row);
    if (!cumulativeDailyKeys.has(dailyKey)) {
      cumulativeDailyKeys.add(dailyKey);
      inc(centerCumulativeDailyVisits, center);
    }
  }

  for (const row of source.totals.data) {
    const center = centerName(row);
    if (monthKey(row.entered_at) === selectedMonth) {
      const monthlyKey = monthVisitorKey(row);
      monthlyUniqueKeys.add(monthlyKey);
      if (!centerMonthlyUnique.has(center)) centerMonthlyUnique.set(center, new Set());
      centerMonthlyUnique.get(center)!.add(monthlyKey);
    }
  }

  for (const center of V2_CENTERS) {
    centerMonthlyUniqueCount.set(center.name, centerMonthlyUnique.get(center.name)?.size ?? 0);
  }

  for (const row of visitRows) {
    const key = userKey(row);
    const center = centerName(row);
    const dailyCenterVisitKey = visitEventKey(row);
    if (!dailyCenterVisitKeys.has(dailyCenterVisitKey)) {
      dailyCenterVisitKeys.add(dailyCenterVisitKey);
      const visitSequence = (dailyCenterVisitCounts.get(key) ?? 0) + 1;
      dailyCenterVisitCounts.set(key, visitSequence);
      dedupedVisitRows.push(row);
      const hasCountVisitHistory = "count_visit" in row || countVisitByEvent.has(dailyCenterVisitKey);
      const countVisit = "count_visit" in row ? row.count_visit : countVisitByEvent.get(dailyCenterVisitKey);
      const isFirstByHistory = isFirstVisitLabel(countVisit);
      if (isFirstByHistory === true) {
        firstVisitEvents += 1;
      } else if (isFirstByHistory === false || hasCountVisitHistory) {
        revisitVisitEvents += 1;
      } else if (visitSequence === 1) {
        firstVisitEvents += 1;
      } else {
        revisitVisitEvents += 1;
      }
      inc(visitCountDistribution, visitCountBucket(countVisit, visitSequence, hasCountVisitHistory));
      inc(dailyVisits, dateKey(row.entered_at));
      inc(centerVisits, center);
      if (!centerUnique.has(center)) centerUnique.set(center, new Set());
      centerUnique.get(center)!.add(key);

      const age = row.user?.age ?? (row as DidongTotalRow).age;
      const gender = row.user?.gender ?? (row as DidongTotalRow).gender;
      const location = row.user?.location ?? (row as DidongTotalRow).location;
      inc(ageDistribution, ageBucket(age));
      inc(genderDistribution, genderLabel(gender));
      inc(locationDistribution, location?.trim() || "미상");
    }

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

    const contact = row.user?.contact ?? (row as DidongTotalRow).contact;
    if (!contact) missingContactCount += 1;

    for (let hour = 9; hour <= 18; hour++) {
      const start = new Date(entered ?? 0);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setMinutes(59, 59, 999);
      if (entered && entered <= end && (!left || left >= start)) inc(hourlyOccupancy, `${hour}시`);
    }
  }

  const surveyScores = {
    program: [] as number[],
    operation: [] as number[],
    help: [] as number[],
    total: [] as number[],
  };
  let revisitPositive = 0;
  const programLike = new Map<string, number>();
  const programSatisfactionValues = new Map<string, number[]>();
  const surveyGenderDistribution = new Map<string, number>();
  const surveyAgeDistribution = new Map<string, number>();
  const surveyVisitCountDistribution = new Map<string, number>();
  const surveyWillReturnDistribution = new Map<string, number>();
  const surveyMonthly = new Map<string, number>();

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
    inc(surveyGenderDistribution, genderLabel(row.user?.gender ?? row.gender));
    inc(surveyAgeDistribution, ageDecadeLabel(row.user?.age ?? row.age));
    inc(surveyVisitCountDistribution, String(row.count_visit || "미응답"));
    inc(surveyWillReturnDistribution, isPositive(row.revisit) ? "재방문 의향 있음" : "기타");
    inc(surveyMonthly, dateKey((row as { created_at?: string | null }).created_at || row.survey_created_at).slice(0, 7));
    for (const name of splitProgramNames(row.format_most_like || row.most_like)) inc(programLike, name);
    if (programScore != null) {
      const programNames = splitProgramNames(row.format_programs || row.programs || row.format_most_like || row.most_like);
      for (const name of programNames) {
        if (!programSatisfactionValues.has(name)) programSatisfactionValues.set(name, []);
        programSatisfactionValues.get(name)!.push(programScore);
      }
    }
  }

  for (const row of source.totals.data) {
    if (!row.survey_created_at) surveyMissingCount += 1;
  }

  const programApplications = new Map<string, number>();
  const programCompletions = new Map<string, number>();
  const programWaiting = new Map<string, number>();
  const programOrderValues = new Map<string, number[]>();
  const programByCenter = new Map<string, number>();
  const programByMonth = new Map<string, number>();

  for (const row of source.waitings.data) {
    const title = row.program?.title?.trim() || "미상";
    inc(programApplications, title);
    inc(programByCenter, centerName({
      center_type: row.center_type ?? row.program?.center_type,
      format_center_type: row.format_center_type ?? row.program?.format_center_type,
    }));
    inc(programByMonth, dateKey(row.finished_at || row.created_at).slice(0, 7));
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

  const couponTotal = source.coupons.data.length;
  const couponGiven = source.coupons.data.filter((row) => row.used_at || row.give_at).length;
  const couponNotUsed = source.coupons.data.filter((row) => !(row.used_at || row.give_at)).length;
  const couponByCenterRows = toPoints(source.coupons.data.reduce((map, row) => {
      inc(map, centerName(row));
      return map;
    }, new Map<string, number>()));
  const couponDaily = source.coupons.data.reduce((map, row) => {
    inc(map, dateKey(row.give_at || row.used_at || row.created_at));
    return map;
  }, new Map<string, number>());

  for (const center of V2_CENTERS) {
    const row: Record<string, string | number> = { center: center.name };
    for (const age of ["40대 이하", "50대", "60대", "70대", "80대 이상", "미상"]) {
      row[age] = dedupedVisitRows.filter((item) => centerName(item) === center.name && ageBucket(item.user?.age ?? (item as DidongTotalRow).age) === age).length;
    }
    centerAgeHeatmap.push(row);
  }

  const uniqueUsers = monthlyUniqueKeys.size || dailyCenterVisitCounts.size;
  const dedupedVisits = dailyCenterVisitKeys.size;
  const sampledCumulativeVisitCount = [...centerCumulativeDailyVisits.values()].reduce((sum, value) => sum + value, 0);
  const cumulativeVisitCount = source.cumulativeTotals?.truncated
    ? Math.max(source.cumulativeTotals.total, sampledCumulativeVisitCount, dedupedVisits)
    : sampledCumulativeVisitCount || source.cumulativeTotals?.total || dedupedVisits;
  const monthlyUniqueUserCount = monthlyUniqueKeys.size || uniqueUsers;
  const officialCenterStats = selectedOfficialCenters(query.center).map((center) => {
    const monthlyUniqueUsers = centerMonthlyUniqueCount.get(center.name) ?? centerUnique.get(center.name)?.size ?? 0;
    const cumulativeVisits =
      source.cumulativeTotals?.centerTotals?.[center.name] ??
      centerCumulativeDailyVisits.get(center.name) ??
      centerVisits.get(center.name) ??
      0;
    const revisitUsers = Math.max(0, cumulativeVisits - monthlyUniqueUsers);
    return {
      center: center.name,
      monthlyUniqueUsers,
      cumulativeVisits,
      revisitUsers,
      revisitRate: percent(revisitUsers, cumulativeVisits),
    };
  });
  const standardRevisitUsers = officialCenterStats.reduce((sum, item) => sum + item.revisitUsers, 0);
  const officialRateValues = officialCenterStats
    .filter((item) => item.cumulativeVisits > 0)
    .map((item) => item.revisitRate);
  const standardRevisitRate = officialRateValues.length
    ? Math.round((officialRateValues.reduce((sum, value) => sum + value, 0) / officialRateValues.length) * 10) / 10
    : percent(standardRevisitUsers, cumulativeVisitCount);
  const shortStayCount = stayValues.filter((value) => value <= 30).length;
  const longStay2hCount = stayValues.filter((value) => value >= 120).length;
  const totalVisits = dedupedVisits;
  const surveyResponses = source.surveys.total || surveyRows.length;
  const satisfactionAverage = avg(surveyScores.total);
  const programRows = source.waitings.total || source.waitings.data.length;
  const exactCenterProgramTotals = source.waitings.centerTotals;
  const programByCenterRows = exactCenterProgramTotals
    ? V2_CENTERS.map((center) => ({ name: center.name, value: exactCenterProgramTotals[center.name] ?? 0 }))
    : toPoints(programByCenter);
  const programApplicationRows = toPoints(programApplications, 20);
  const topProgram = programApplicationRows[0];
  const programSatisfactionRows = Array.from(programSatisfactionValues.entries())
    .map(([name, values]) => ({
      name,
      value: Math.round((avg(values) ?? 0) * 100) / 100,
      responses: values.length,
      demand: programApplications.get(name) ?? 0,
    }))
    .filter((row) => row.responses >= 1)
    .sort((a, b) => b.value - a.value || b.responses - a.responses)
    .slice(0, 20);
  const programOpportunityRows = programSatisfactionRows.map((row) => ({
    name: row.name,
    value: row.demand || row.responses,
    satisfaction: row.value,
    responses: row.responses,
  }));
  const improvementCandidateRows = programOpportunityRows
    .filter((row) => row.value > 0)
    .sort((a, b) => (a.satisfaction || 6) - (b.satisfaction || 6) || b.value - a.value)
    .slice(0, 10);
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
    const monthlyUniqueUsers = centerMonthlyUniqueCount.get(name) ?? centerUnique.get(name)?.size ?? 0;
    const cumulativeVisits = source.cumulativeTotals?.centerTotals?.[name] ?? centerCumulativeDailyVisits.get(name) ?? visits;
    return {
      center: name,
      visits,
      uniqueUsers: monthlyUniqueUsers,
      cumulativeVisits,
      standardRevisitRate: percent(Math.max(0, cumulativeVisits - monthlyUniqueUsers), cumulativeVisits),
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

  const operationsRows = visitRows
    .filter((row) => !row.leaved_at || (stayMinutes(row) != null && (stayMinutes(row)! < 0 || stayMinutes(row)! > 480)) || !row.user)
    .map((row) => ({
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
  const rawRows = [
    ...visitRows.map((row) => ({
      source: "입퇴장",
      center: centerName(row),
      name: maskName(row.user?.name),
      contact: maskContact(row.user?.contact),
      date: row.entered_at || "",
      status: row.leaved_at ? "퇴장 완료" : "미퇴장",
    })),
    ...source.waitings.data.map((row: DidongWaitingRow) => ({
      source: "예약/대기",
      center: centerName({
        center_type: row.center_type ?? row.program?.center_type,
        format_center_type: row.format_center_type ?? row.program?.format_center_type,
      }),
      name: maskName(row.user?.name),
      contact: maskContact(row.user?.contact),
      date: row.created_at || row.finished_at || "",
      status: row.format_state || row.state || "미상",
    })),
    ...source.surveys.data.map((row) => ({
      source: "설문",
      center: centerName(row),
      name: maskName(row.user?.name ?? row.name),
      contact: maskContact(row.user?.contact ?? row.contact),
      date: (row as { created_at?: string | null }).created_at || row.survey_created_at || "",
      status: "응답",
    })),
    ...source.coupons.data.map((row: DidongCouponRow) => ({
      source: "쿠폰",
      center: centerName(row),
      name: maskName(row.user?.name),
      contact: maskContact(row.user?.contact),
      date: row.created_at || row.give_at || row.used_at || "",
      status: row.give_at || row.used_at ? "지급 완료" : "미지급",
    })),
  ];

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
      uniqueUsers: monthlyUniqueUserCount,
      dedupedVisits,
      newUsers: monthlyUniqueUserCount,
      revisitUsers: standardRevisitUsers,
      revisitRate: standardRevisitRate,
      cumulativeVisits: cumulativeVisitCount,
      avgStayMinutes: Math.round(avg(stayValues) ?? 0),
      shortStayCount,
      shortStayRate: percent(shortStayCount, stayValues.length),
      longStay2hCount,
      longStay2hRate: percent(longStay2hCount, stayValues.length),
      surveyResponses,
      surveyResponseRate: percent(surveyResponses, totalVisits),
      avgSatisfaction: Math.round((satisfactionAverage ?? 0) * 10) / 10,
      revisitIntentRate: percent(revisitPositive, surveyResponses),
      programCompletions: programRows || [...programCompletions.values()].reduce((sum, value) => sum + value, 0),
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
      programApplications: programApplicationRows,
      programCompletions: toPoints(programCompletions, 10),
      programWaiting: toPoints(programWaiting, 10),
      programAverageOrder: Array.from(programOrderValues.entries()).map(([name, values]) => ({
        name,
        value: Math.round(avg(values) ?? 0),
      })).sort((a, b) => b.value - a.value).slice(0, 10),
      programLikes: toPoints(programLike, 10),
      programByCenter: programByCenterRows,
      programByMonth: Array.from(programByMonth.entries()).sort().map(([name, value]) => ({ name, value })),
      programSatisfactionRanking: programSatisfactionRows,
      programOpportunity: programOpportunityRows,
      programImprovementCandidates: improvementCandidateRows,
      couponStatus: [
        { name: "지급 완료", value: couponGiven },
        { name: "미지급", value: couponNotUsed },
      ],
      couponByCenter: couponByCenterRows,
      couponDaily: Array.from(couponDaily.entries()).sort().map(([name, value]) => ({ name, value })),
      surveyGenderDistribution: toPoints(surveyGenderDistribution),
      surveyAgeDistribution: toPoints(surveyAgeDistribution),
      surveyVisitCountDistribution: toPoints(surveyVisitCountDistribution),
      surveyWillReturnDistribution: toPoints(surveyWillReturnDistribution),
      surveyMonthly: Array.from(surveyMonthly.entries()).sort().map(([name, value]) => ({ name, value })),
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
    programs: {
      total: programRows,
      typeCount: programApplications.size,
      topName: topProgram?.name || "—",
      topCount: topProgram?.value || 0,
    },
    survey: {
      total: surveyResponses,
      satisfaction: {
        program: Math.round((avg(surveyScores.program) ?? 0) * 100) / 100,
        operation: Math.round((avg(surveyScores.operation) ?? 0) * 100) / 100,
        digitalHelp: Math.round((avg(surveyScores.help) ?? 0) * 100) / 100,
      },
    },
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
    coupons: {
      total: couponTotal,
      given: couponGiven,
      notUsed: couponNotUsed,
      rows: source.coupons.data.map((row) => ({
        center: centerName(row),
        name: maskName(row.user?.name),
        contact: maskContact(row.user?.contact),
        createdAt: row.created_at || "",
        givenAt: row.give_at || row.used_at || "",
        status: row.give_at || row.used_at ? "지급 완료" : "미지급",
      })),
    },
    rawData: {
      rows: rawRows,
    },
  };
}
