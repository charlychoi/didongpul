import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ParsedSheet } from "./parseExcel";
import { normalizeCenter } from "../normalization/normalizeCenter";
import { parseExcelDate } from "../normalization/normalizeDate";
import { hashPhone, maskName, makeVisitorKey } from "../normalization/normalizePhone";
import { normalizeAttendanceStatus } from "../normalization/normalizeEducation";
import crypto from "crypto";

export async function ingestEducationSheet(
  uploadBatchId: string,
  sheet: ParsedSheet
): Promise<{ saved: number; errors: number }> {
  let saved = 0;
  let errors = 0;
  const records: Prisma.EducationAttendanceCreateManyInput[] = [];

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const rowNum = i + 2;

    const centerRaw = getStr(row, "센터") ?? getStr(row, "방문센터");
    const programName = getStr(row, "프로그램명") ?? getStr(row, "교육명") ?? getStr(row, "이용프로그램");
    const eduDateRaw = row["교육일자"] ?? row["일시"] ?? row["교육일"] ?? row["등록일자"];
    const startTime = getStr(row, "시작") ?? getStr(row, "시작시간");
    const endTime = getStr(row, "종료") ?? getStr(row, "종료시간");
    const participantName = getStr(row, "참여자") ?? getStr(row, "이름") ?? getStr(row, "성명");
    const phoneRaw = getStr(row, "연락처") ?? getStr(row, "전화");
    const emailRaw = getStr(row, "이메일");
    const attendanceRaw = getStr(row, "참석") ?? getStr(row, "출석");
    const category = getStr(row, "구분");
    const statusNote = getStr(row, "비고");

    const center = normalizeCenter(centerRaw);
    const eduDate = parseExcelDate(eduDateRaw);
    const attendanceStatus = normalizeAttendanceStatus(attendanceRaw);
    const phoneHash = hashPhone(phoneRaw);
    const emailHash = emailRaw
      ? crypto.createHash("sha256").update(emailRaw.trim()).digest("hex").slice(0, 16)
      : null;
    const participantKey = makeVisitorKey(participantName, phoneRaw);
    const participantNameMasked = maskName(participantName);

    records.push({
      uploadBatchId,
      sheetName: sheet.sheetName,
      rowNumber: rowNum,
      center: center ?? centerRaw ?? null,
      category,
      programName,
      educationDate: eduDate,
      startTime,
      endTime,
      statusNote,
      participantNameMasked,
      participantKey,
      phoneHash,
      emailHash,
      attendanceStatus,
      year: eduDate ? eduDate.getFullYear() : null,
      month: eduDate ? eduDate.getMonth() + 1 : null,
      rawJson: JSON.stringify(row),
    });
    saved++;
  }

  if (records.length > 0) {
    try {
      await prisma.educationAttendance.createMany({ data: records });
    } catch (e) {
      errors = records.length;
    }
  }

  return { saved, errors };
}

function getStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (v == null) return null;
  return String(v).trim() || null;
}
