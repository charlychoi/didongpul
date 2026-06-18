import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ParsedSheet } from "./parseExcel";
import { normalizeCenter } from "../normalization/normalizeCenter";
import { parseExcelDate } from "../normalization/normalizeDate";
import { hashPhone, maskName, makeVisitorKey } from "../normalization/normalizePhone";

interface IngestResult {
  saved: number;
  errors: number;
}

export async function ingestVisitSheet(
  uploadBatchId: string,
  sheet: ParsedSheet
): Promise<IngestResult> {
  let saved = 0;
  let errors = 0;
  const qualityLogs: Prisma.DataQualityLogCreateManyInput[] = [];
  const rawLogs: Prisma.RawVisitLogCreateManyInput[] = [];
  type CleanLogData = Omit<Prisma.CleanVisitLogUncheckedCreateInput, "rawVisitLog">;
  const cleanLogs: CleanLogData[] = [];

  // 당일 동일 센터 재방문 감지: "센터_날짜" → Set<visitorKey>
  const sameDayVisits = new Map<string, Set<string>>();

  const COL = detectVisitColumns(sheet.headers);

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    const centerRaw = getString(row, COL.center);
    const nameRaw = getString(row, COL.name);
    const phoneRaw = getString(row, COL.phone);
    const entryRaw = getString(row, COL.entry) ?? row[COL.entry ?? ""];
    const exitRaw = getString(row, COL.exit) ?? row[COL.exit ?? ""];
    const yearRaw = getString(row, COL.year);
    const monthRaw = getString(row, COL.month);

    const rawId = `${uploadBatchId}_${sheet.sheetName}_${rowNum}`;

    rawLogs.push({
      id: rawId,
      uploadBatchId,
      sheetName: sheet.sheetName,
      rowNumber: rowNum,
      centerRaw: centerRaw ?? null,
      nameRaw: nameRaw ?? null,
      phoneRaw: phoneRaw ?? null,
      entryDatetimeRaw: entryRaw != null ? String(entryRaw) : null,
      exitDatetimeRaw: exitRaw != null ? String(exitRaw) : null,
      yearRaw: yearRaw ?? null,
      monthRaw: monthRaw ?? null,
      rawJson: JSON.stringify(row),
    });

    // Clean
    const center = normalizeCenter(centerRaw);
    if (!center) {
      qualityLogs.push({
        uploadBatchId,
        issueType: "center_normalization",
        severity: "warning",
        sheetName: sheet.sheetName,
        rowNumber: rowNum,
        columnName: COL.center,
        rawValue: centerRaw ?? null,
        message: `센터명 표준화 실패: "${centerRaw}"`,
      });
    }

    const entryDt = parseExcelDate(entryRaw);
    if (!entryDt) {
      qualityLogs.push({
        uploadBatchId,
        issueType: "invalid_date",
        severity: "warning",
        sheetName: sheet.sheetName,
        rowNumber: rowNum,
        columnName: COL.entry,
        rawValue: entryRaw != null ? String(entryRaw) : null,
        message: `입장일시 변환 실패`,
      });
    }

    const exitDt = parseExcelDate(exitRaw);
    if (!exitDt && entryDt) {
      qualityLogs.push({
        uploadBatchId,
        issueType: "invalid_date",
        severity: "info",
        sheetName: sheet.sheetName,
        rowNumber: rowNum,
        columnName: COL.exit,
        rawValue: exitRaw != null ? String(exitRaw) : null,
        message: `퇴장일시 없음`,
      });
    }

    let stayMinutes: number | null = null;
    let isLongStay = false;
    let isInvalidStay = false;

    if (entryDt && exitDt) {
      stayMinutes = (exitDt.getTime() - entryDt.getTime()) / 60000;
      if (stayMinutes < 0) {
        isInvalidStay = true;
        qualityLogs.push({
          uploadBatchId,
          issueType: "invalid_stay_time",
          severity: "critical",
          sheetName: sheet.sheetName,
          rowNumber: rowNum,
          message: `퇴장일시가 입장일시보다 이전: stay=${stayMinutes.toFixed(0)}분`,
        });
      } else if (stayMinutes >= 600) {
        isLongStay = true;
        qualityLogs.push({
          uploadBatchId,
          issueType: "long_stay",
          severity: "warning",
          sheetName: sheet.sheetName,
          rowNumber: rowNum,
          message: `장시간 체류: ${(stayMinutes / 60).toFixed(1)}시간`,
        });
      }
    }

    const phoneHash = hashPhone(phoneRaw);
    const visitorKey = makeVisitorKey(nameRaw, phoneRaw);
    const visitorNameMasked = maskName(nameRaw);

    // 당일 동일 센터 재방문 여부 감지
    const visitDateObj = entryDt
      ? new Date(entryDt.getFullYear(), entryDt.getMonth(), entryDt.getDate())
      : null;
    let isDuplicateSuspected = false;
    if (visitorKey && visitDateObj && center) {
      const mapKey = `${center}_${visitDateObj.toISOString().slice(0, 10)}`;
      if (!sameDayVisits.has(mapKey)) sameDayVisits.set(mapKey, new Set());
      const daySet = sameDayVisits.get(mapKey)!;
      if (daySet.has(visitorKey)) {
        isDuplicateSuspected = true;
        qualityLogs.push({
          uploadBatchId,
          issueType: "duplicate_visit",
          severity: "info",
          sheetName: sheet.sheetName,
          rowNumber: rowNum,
          message: `당일 동일 센터 재방문 감지: ${center} ${visitDateObj.toISOString().slice(0, 10)} (방문건수에는 포함, 고유방문자로는 1명 집계)`,
        });
      } else {
        daySet.add(visitorKey);
      }
    }

    cleanLogs.push({
      id: `clean_${rawId}`,
      rawVisitId: rawId,
      center: center ?? "미상",
      visitorNameMasked,
      visitorKey,
      phoneHash,
      entryDatetime: entryDt,
      exitDatetime: exitDt,
      visitDate: visitDateObj,
      entryHour: entryDt ? entryDt.getHours() : null,
      exitHour: exitDt ? exitDt.getHours() : null,
      stayMinutes,
      stayHours: stayMinutes != null ? stayMinutes / 60 : null,
      year: entryDt ? entryDt.getFullYear() : null,
      month: entryDt ? entryDt.getMonth() + 1 : null,
      weekday: entryDt ? entryDt.getDay() : null,
      isLongStay,
      isInvalidStay,
      isDuplicateSuspected,
    });

    saved++;
  }

  // Batch insert raw logs
  if (rawLogs.length > 0) {
    await prisma.rawVisitLog.createMany({ data: rawLogs });
  }

  // Insert clean logs one by one to handle FK constraints
  for (const cl of cleanLogs) {
    try {
      await prisma.cleanVisitLog.create({ data: cl as Prisma.CleanVisitLogUncheckedCreateInput });
    } catch {
      errors++;
    }
  }

  // Batch quality logs
  if (qualityLogs.length > 0) {
    await prisma.dataQualityLog.createMany({ data: qualityLogs });
  }

  return { saved, errors };
}

function getString(row: Record<string, unknown>, col: string | undefined): string | null {
  if (!col) return null;
  const v = row[col];
  if (v == null) return null;
  return String(v).trim() || null;
}

interface VisitColumns {
  center?: string;
  name?: string;
  phone?: string;
  entry?: string;
  exit?: string;
  year?: string;
  month?: string;
}

function detectVisitColumns(headers: string[]): VisitColumns {
  const find = (...candidates: string[]) =>
    headers.find((h) => candidates.some((c) => h.includes(c)));

  return {
    center: find("방문센터", "센터"),
    name: find("이름", "성명"),
    phone: find("연락처", "전화"),
    entry: find("입장일", "입실", "입장시"),
    exit: find("퇴장일", "퇴실", "퇴장시"),
    year: find("연도", "년도"),
    month: find("월"),
  };
}
