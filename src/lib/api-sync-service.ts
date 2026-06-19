"use server";

import { prisma } from "@/lib/prisma";
import {
  DIDONG_CENTERS,
  CenterCode,
  fetchAllVisits,
  fetchAllSurveys,
  fetchAllWaitings,
  DidongVisit,
  DidongSurvey,
  DidongWaiting,
} from "@/lib/didong-api";
import { hashPhone, maskName, makeVisitorKey } from "@/features/normalization/normalizePhone";
import { rebuildDailySummary, rebuildMonthlySummary } from "@/features/upload/buildAggregates";

const CENTER_CODE_TO_NAME: Record<string, string> = {
  "2": "강동센터",
  "3": "도봉센터",
  "4": "동대문센터",
};

// API 시스템 사용자 (batch의 uploadedById로 사용)
async function getOrCreateApiUser(): Promise<string> {
  const email = "api-sync@system.internal";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "API 자동 동기화",
        passwordHash: "not-a-login-account",
        role: "system",
        centerScope: "ALL",
        isActive: false,
      },
    });
  }
  return user.id;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateTime(raw: string | undefined | null): Date | null {
  if (!raw || raw.trim() === "") return null;
  const dt = new Date(raw.replace(" ", "T") + ":00");
  return isNaN(dt.getTime()) ? null : dt;
}

// ─────────────────────────────────────────────────────────────────────────────
// 방문 기록 동기화
// ─────────────────────────────────────────────────────────────────────────────
async function syncVisits(
  batchId: string,
  centerCode: CenterCode,
  visits: DidongVisit[]
): Promise<{ inserted: number; skipped: number; affectedMonths: Set<string> }> {
  const affectedMonths = new Set<string>();
  let inserted = 0;
  let skipped = 0;

  for (const item of visits) {
    const extId = `visit_${item.id}`;

    // 이미 존재하면 스킵 (idempotent)
    const existing = await prisma.rawVisitLog.findUnique({
      where: { externalId: extId },
    });
    if (existing) { skipped++; continue; }

    const centerName = CENTER_CODE_TO_NAME[item.center_type] ?? item.format_center_type;
    const entryDt = parseDateTime(item.entered_at);
    const exitDt = parseDateTime(item.leaved_at);
    const visitDate = entryDt ?? new Date();
    const year = visitDate.getFullYear();
    const month = visitDate.getMonth() + 1;
    affectedMonths.add(`${year}-${month}`);

    const user = item.user;
    const phoneHash = hashPhone(user?.contact);
    const visitorNameMasked = maskName(user?.name);
    const visitorKey = makeVisitorKey(user?.name, user?.contact);
    const entryHour = entryDt ? entryDt.getHours() : null;
    const exitHour = exitDt ? exitDt.getHours() : null;
    const stayMinutes =
      entryDt && exitDt ? (exitDt.getTime() - entryDt.getTime()) / 60000 : null;
    const stayHours = stayMinutes != null ? stayMinutes / 60 : null;
    const isLongStay = stayMinutes != null && stayMinutes > 240;
    const isInvalidStay = stayMinutes != null && (stayMinutes < 0 || stayMinutes > 720);
    const weekday = entryDt ? entryDt.getDay() : null;

    // raw 레코드 생성
    const raw = await prisma.rawVisitLog.create({
      data: {
        uploadBatchId: batchId,
        externalId: extId,
        sheetName: "api_visits",
        rowNumber: item.id,
        centerRaw: centerName,
        nameRaw: user?.name ?? null,
        phoneRaw: user?.contact ?? null,
        entryDatetimeRaw: item.entered_at,
        exitDatetimeRaw: item.leaved_at || null,
        rawJson: JSON.stringify(item),
      },
    });

    // clean 레코드 생성
    await prisma.cleanVisitLog.create({
      data: {
        rawVisitId: raw.id,
        center: centerName,
        visitorNameMasked,
        visitorKey,
        phoneHash,
        entryDatetime: entryDt,
        exitDatetime: exitDt,
        visitDate,
        entryHour,
        exitHour,
        stayMinutes,
        stayHours,
        year,
        month,
        weekday,
        isLongStay,
        isInvalidStay,
        isDuplicateSuspected: false,
      },
    });

    inserted++;
  }

  return { inserted, skipped, affectedMonths };
}

// ─────────────────────────────────────────────────────────────────────────────
// 설문 동기화
// ─────────────────────────────────────────────────────────────────────────────
async function syncSurveys(
  batchId: string,
  surveys: DidongSurvey[]
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const item of surveys) {
    const extId = `survey_${item.id}`;
    const existing = await prisma.surveyResponse.findUnique({
      where: { externalId: extId },
    });
    if (existing) { skipped++; continue; }

    const centerName = CENTER_CODE_TO_NAME[item.center_type] ?? item.format_center_type;
    const responseDate = parseDateTime(item.created_at);
    const year = responseDate ? responseDate.getFullYear() : null;
    const month = responseDate ? responseDate.getMonth() + 1 : null;
    const user = item.user;
    const phoneHash = hashPhone(user?.contact);
    const respondentNameMasked = maskName(user?.name);
    const respondentKey = makeVisitorKey(user?.name, user?.contact);

    await prisma.surveyResponse.create({
      data: {
        uploadBatchId: batchId,
        externalId: extId,
        sheetName: "api_surveys",
        rowNumber: item.id,
        center: centerName,
        respondentNameMasked,
        respondentKey,
        phoneHash,
        gender: item.gender || null,
        ageGroup: item.age ? parseInt(item.age) : null,
        residence: item.location || null,
        howFound: item.format_way_to_come || item.way_to_come || null,
        visitCount: String(item.count_visit ?? ""),
        participatedPrograms: item.format_programs || item.programs || null,
        favoriteProgram: item.format_most_like || item.most_like || null,
        programSatisfaction: String(item.program_satisfaction ?? ""),
        operationSatisfaction: String(item.operate_satisfaction ?? ""),
        digitalHelpSatisfaction: String(item.help_it_satisfaction ?? ""),
        willReturn: item.revisit || null,
        responseDate,
        year,
        month,
        rawJson: JSON.stringify(item),
      },
    });
    inserted++;
  }

  return { inserted, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// 교육(예약완료) 동기화
// ─────────────────────────────────────────────────────────────────────────────
async function syncWaitings(
  batchId: string,
  waitings: DidongWaiting[]
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const item of waitings) {
    if (!item.program) continue;
    const extId = `waiting_${item.id}`;
    const existing = await prisma.educationAttendance.findUnique({
      where: { externalId: extId },
    });
    if (existing) { skipped++; continue; }

    const centerName =
      CENTER_CODE_TO_NAME[item.program.center_type] ?? item.program.format_center_type;
    const eduDate = parseDateTime(item.finished_at);
    const year = eduDate ? eduDate.getFullYear() : null;
    const month = eduDate ? eduDate.getMonth() + 1 : null;
    const user = item.user;
    const phoneHash = hashPhone(user?.contact);
    const participantNameMasked = maskName(user?.name);
    const participantKey = makeVisitorKey(user?.name, user?.contact);

    await prisma.educationAttendance.create({
      data: {
        uploadBatchId: batchId,
        externalId: extId,
        sheetName: "api_waitings",
        rowNumber: item.id,
        center: centerName,
        programName: item.program.title,
        educationDate: eduDate,
        participantNameMasked,
        participantKey,
        phoneHash,
        attendanceStatus: item.format_state,
        year,
        month,
        rawJson: JSON.stringify(item),
      },
    });
    inserted++;
  }

  return { inserted, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 API: 단일 센터 증분 동기화
// ─────────────────────────────────────────────────────────────────────────────
export interface SyncCenterResult {
  center: string;
  visits: { inserted: number; skipped: number };
  surveys: { inserted: number; skipped: number };
  waitings: { inserted: number; skipped: number };
  affectedMonths: string[];
  error?: string;
}

export async function syncCenter(
  centerCode: CenterCode,
  fromDate: string,
  toDate: string
): Promise<SyncCenterResult> {
  const centerName = CENTER_CODE_TO_NAME[String(centerCode)];
  try {
    const userId = await getOrCreateApiUser();

    // 배치 생성 (source_type = api_sync)
    const batch = await prisma.uploadBatch.create({
      data: {
        originalFilename: `api_sync_${centerName}_${fromDate}_${toDate}`,
        fileHash: `api_${centerCode}_${fromDate}_${toDate}`,
        uploadedById: userId,
        sourceType: "api_sync",
        targetMonth: fromDate.slice(0, 7),
        status: "processing",
      },
    });

    // 병렬 fetch
    const [visits, surveys, waitings] = await Promise.all([
      fetchAllVisits(centerCode, fromDate, toDate),
      fetchAllSurveys(centerCode, fromDate, toDate),
      fetchAllWaitings(centerCode, fromDate, toDate),
    ]);

    // 삽입
    const visitsResult = await syncVisits(batch.id, centerCode, visits);
    const surveysResult = await syncSurveys(batch.id, surveys);
    const waitingsResult = await syncWaitings(batch.id, waitings);

    // 영향받은 월 집계 재계산
    const allAffected = new Set([...visitsResult.affectedMonths]);
    for (const ym of allAffected) {
      const [y, m] = ym.split("-").map(Number);
      await rebuildDailySummary(y, m);
      await rebuildMonthlySummary(y, m);
    }

    // 배치 완료 처리
    const totalInserted = visitsResult.inserted + surveysResult.inserted + waitingsResult.inserted;
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        status: "completed",
        rowCountTotal: totalInserted,
      },
    });

    // sync log 기록
    await prisma.apiSyncLog.create({
      data: {
        center: centerName,
        syncType: "full",
        syncedFrom: fromDate,
        syncedTo: toDate,
        recordsFetched: visits.length + surveys.length + waitings.length,
        recordsInserted: totalInserted,
        status: "success",
      },
    });

    return {
      center: centerName,
      visits: { inserted: visitsResult.inserted, skipped: visitsResult.skipped },
      surveys: { inserted: surveysResult.inserted, skipped: surveysResult.skipped },
      waitings: { inserted: waitingsResult.inserted, skipped: waitingsResult.skipped },
      affectedMonths: [...allAffected],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.apiSyncLog.create({
      data: {
        center: centerName,
        syncType: "full",
        syncedFrom: fromDate,
        syncedTo: toDate,
        recordsFetched: 0,
        recordsInserted: 0,
        status: "error",
        errorMessage: message,
      },
    });
    return {
      center: centerName,
      visits: { inserted: 0, skipped: 0 },
      surveys: { inserted: 0, skipped: 0 },
      waitings: { inserted: 0, skipped: 0 },
      affectedMonths: [],
      error: message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 전체 센터 동기화 (cron / 수동 공통)
// ─────────────────────────────────────────────────────────────────────────────
export async function syncAllCenters(fromDate?: string, toDate?: string) {
  const today = new Date();
  const to = toDate ?? toDateString(today);
  const from = fromDate ?? (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return toDateString(d);
  })();

  const results = [];
  for (const center of DIDONG_CENTERS) {
    const result = await syncCenter(center.code, from, to);
    results.push(result);
  }
  return { from, to, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// 마지막 동기화 현황 조회
// ─────────────────────────────────────────────────────────────────────────────
export async function getLastSyncStatus() {
  const logs = await prisma.apiSyncLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const latestByCenter: Record<string, (typeof logs)[0]> = {};
  for (const log of logs) {
    if (!latestByCenter[log.center]) {
      latestByCenter[log.center] = log;
    }
  }
  return Object.values(latestByCenter);
}
