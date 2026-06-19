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
  if (visits.length === 0) return { inserted: 0, skipped: 0, affectedMonths };

  // id가 없는 레코드 제거 (null id → "visit_null" 중복 방지)
  const validVisits = visits.filter((v) => v.id != null);

  // 이미 존재하는 externalId 조회 (배치 단위 스킵)
  const extIds = validVisits.map((v) => `visit_${v.id}`);
  const existingRows = await prisma.rawVisitLog.findMany({
    where: { externalId: { in: extIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existingRows.map((r) => r.externalId));

  const newVisits = validVisits.filter((v) => !existingSet.has(`visit_${v.id}`));
  const skipped = validVisits.length - newVisits.length;

  if (newVisits.length === 0) return { inserted: 0, skipped, affectedMonths };

  // raw 배치 삽입 (최대 200건씩)
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < newVisits.length; i += CHUNK) {
    const chunk = newVisits.slice(i, i + CHUNK);

    const rawPayloads = chunk.map((item) => {
      const centerName = CENTER_CODE_TO_NAME[item.center_type] ?? item.format_center_type;
      const user = item.user;
      return {
        uploadBatchId: batchId,
        externalId: `visit_${item.id}`,
        sheetName: "api_visits",
        rowNumber: item.id,
        centerRaw: centerName,
        nameRaw: user?.name ?? null,
        phoneRaw: user?.contact ?? null,
        entryDatetimeRaw: item.entered_at,
        exitDatetimeRaw: item.leaved_at || null,
        rawJson: JSON.stringify(item),
      };
    });

    try {
      await prisma.rawVisitLog.createMany({ data: rawPayloads });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("UNIQUE") && !msg.includes("unique")) throw e;
      // UNIQUE 충돌 시 1건씩 개별 삽입 (이미 존재하는 것 skip)
      for (const row of rawPayloads) {
        await prisma.rawVisitLog.create({ data: row }).catch((err: unknown) => {
          const m = err instanceof Error ? err.message : String(err);
          if (!m.includes("UNIQUE") && !m.includes("unique")) throw err;
        });
      }
    }

    // raw row ID 조회 후 clean 배치 삽입 (newVisits만 처리하므로 clean 중복 없음)
    const rawRows = await prisma.rawVisitLog.findMany({
      where: { externalId: { in: chunk.map((v) => `visit_${v.id}`) } },
      select: { id: true, externalId: true, centerRaw: true },
    });
    const extIdToRawId = new Map(rawRows.map((r) => [r.externalId, { id: r.id, center: r.centerRaw }]));

    const cleanPayloads = chunk.map((item) => {
      const raw = extIdToRawId.get(`visit_${item.id}`);
      if (!raw) return null;

      const centerName = raw.center ?? CENTER_CODE_TO_NAME[item.center_type];
      const entryDt = parseDateTime(item.entered_at);
      const exitDt = parseDateTime(item.leaved_at);
      const visitDate = entryDt ?? new Date();
      const year = visitDate.getFullYear();
      const month = visitDate.getMonth() + 1;
      affectedMonths.add(`${year}-${month}`);

      const user = item.user;
      const stayMinutes = entryDt && exitDt ? (exitDt.getTime() - entryDt.getTime()) / 60000 : null;

      return {
        rawVisitId: raw.id,
        center: centerName,
        visitorNameMasked: maskName(user?.name),
        visitorKey: makeVisitorKey(user?.name, user?.contact),
        phoneHash: hashPhone(user?.contact),
        entryDatetime: entryDt,
        exitDatetime: exitDt,
        visitDate,
        entryHour: entryDt ? entryDt.getHours() : null,
        exitHour: exitDt ? exitDt.getHours() : null,
        stayMinutes,
        stayHours: stayMinutes != null ? stayMinutes / 60 : null,
        year,
        month,
        weekday: entryDt ? entryDt.getDay() : null,
        isLongStay: stayMinutes != null && stayMinutes > 240,
        isInvalidStay: stayMinutes != null && (stayMinutes < 0 || stayMinutes > 720),
        isDuplicateSuspected: false,
      };
    }).filter((d): d is NonNullable<typeof d> => d !== null);

    if (cleanPayloads.length > 0) {
      // 혹시 이미 존재하는 clean rows 제외 (이중 안전망)
      const existingCleanIds = new Set(
        (await prisma.cleanVisitLog.findMany({
          where: { rawVisitId: { in: cleanPayloads.map((d) => d.rawVisitId) } },
          select: { rawVisitId: true },
        })).map((r) => r.rawVisitId)
      );
      const newClean = cleanPayloads.filter((d) => !existingCleanIds.has(d.rawVisitId));
      if (newClean.length > 0) {
        await prisma.cleanVisitLog.createMany({ data: newClean });
        inserted += newClean.length;
      }
    }
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
  if (surveys.length === 0) return { inserted: 0, skipped: 0 };

  const extIds = surveys.map((s) => `survey_${s.id}`);
  const existingSet = new Set(
    (await prisma.surveyResponse.findMany({ where: { externalId: { in: extIds } }, select: { externalId: true } }))
      .map((r) => r.externalId)
  );

  const newItems = surveys.filter((s) => !existingSet.has(`survey_${s.id}`));
  const skipped = surveys.length - newItems.length;
  if (newItems.length === 0) return { inserted: 0, skipped };

  await prisma.surveyResponse.createMany({
    data: newItems.map((item) => {
      const centerName = CENTER_CODE_TO_NAME[item.center_type] ?? item.format_center_type;
      const responseDate = parseDateTime(item.created_at);
      const user = item.user;
      return {
        uploadBatchId: batchId,
        externalId: `survey_${item.id}`,
        sheetName: "api_surveys",
        rowNumber: item.id,
        center: centerName,
        respondentNameMasked: maskName(user?.name),
        respondentKey: makeVisitorKey(user?.name, user?.contact),
        phoneHash: hashPhone(user?.contact),
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
        year: responseDate ? responseDate.getFullYear() : null,
        month: responseDate ? responseDate.getMonth() + 1 : null,
        rawJson: JSON.stringify(item),
      };
    }),
  });

  return { inserted: newItems.length, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// 교육(예약완료) 동기화
// ─────────────────────────────────────────────────────────────────────────────
async function syncWaitings(
  batchId: string,
  waitings: DidongWaiting[]
): Promise<{ inserted: number; skipped: number }> {
  const withProgram = waitings.filter((w) => w.program);
  if (withProgram.length === 0) return { inserted: 0, skipped: waitings.length - withProgram.length };

  const extIds = withProgram.map((w) => `waiting_${w.id}`);
  const existingSet = new Set(
    (await prisma.educationAttendance.findMany({ where: { externalId: { in: extIds } }, select: { externalId: true } }))
      .map((r) => r.externalId)
  );

  const newItems = withProgram.filter((w) => !existingSet.has(`waiting_${w.id}`));
  const skipped = waitings.length - newItems.length;
  if (newItems.length === 0) return { inserted: 0, skipped };

  await prisma.educationAttendance.createMany({
    data: newItems.map((item) => {
      const centerName =
        CENTER_CODE_TO_NAME[item.program!.center_type] ?? item.program!.format_center_type;
      const eduDate = parseDateTime(item.finished_at);
      const user = item.user;
      return {
        uploadBatchId: batchId,
        externalId: `waiting_${item.id}`,
        sheetName: "api_waitings",
        rowNumber: item.id,
        center: centerName,
        programName: item.program!.title,
        educationDate: eduDate,
        participantNameMasked: maskName(user?.name),
        participantKey: makeVisitorKey(user?.name, user?.contact),
        phoneHash: hashPhone(user?.contact),
        attendanceStatus: item.format_state,
        year: eduDate ? eduDate.getFullYear() : null,
        month: eduDate ? eduDate.getMonth() + 1 : null,
        rawJson: JSON.stringify(item),
      };
    }),
  });

  return { inserted: newItems.length, skipped };
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
  let batchId: string | null = null;
  try {
    const userId = await getOrCreateApiUser();

    // 배치 생성 (source_type = api_sync)
    const batch = await prisma.uploadBatch.create({
      data: {
        originalFilename: `api_sync_${centerName}_${fromDate}_${toDate}`,
        fileHash: `api_${centerCode}_${fromDate}_${toDate}_${Date.now()}`,
        uploadedById: userId,
        sourceType: "api_sync",
        targetMonth: fromDate.slice(0, 7),
        status: "processing",
      },
    });
    batchId = batch.id;

    // 순차 fetch (동시 요청 시 rate limit 발생)
    // API 페이지네이션 중복 반환 방어: id 기준 중복 제거
    const rawVisits = await fetchAllVisits(centerCode, fromDate, toDate);
    const visits = [...new Map(rawVisits.map((v) => [v.id, v])).values()];

    const rawSurveys = await fetchAllSurveys(centerCode, fromDate, toDate);
    const surveys = [...new Map(rawSurveys.map((s) => [s.id, s])).values()];

    const rawWaitings = await fetchAllWaitings(centerCode, fromDate, toDate);
    const waitings = [...new Map(rawWaitings.map((w) => [w.id, w])).values()];

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
    const totalSkipped = visitsResult.skipped + surveysResult.skipped + waitingsResult.skipped;
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        status: "completed",
        rowCountTotal: totalInserted,
        duplicateCount: totalSkipped,
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
    // 배치가 생성된 경우 failed로 업데이트 (처리중 stuck 방지)
    if (batchId) {
      await prisma.uploadBatch.update({
        where: { id: batchId },
        data: { status: "failed" },
      }).catch(() => {});
    }
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
  // cron 기본값: 2일 전 (어제+오늘). 수동 sync는 fromDate를 직접 전달
  const from = fromDate ?? (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
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
