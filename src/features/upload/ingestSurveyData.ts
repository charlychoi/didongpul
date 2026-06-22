import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ParsedSheet } from "./parseExcel";
import { normalizeCenter } from "../normalization/normalizeCenter";
import { parseExcelDate } from "../normalization/normalizeDate";
import { hashPhone, maskName, makeVisitorKey } from "../normalization/normalizePhone";

const SATISFACTION_SCORE: Record<string, number> = {
  "매우 그렇다": 5,
  "그렇다": 4,
  "보통이다": 3,
  "그렇지 않다": 2,
  "매우 그렇지 않다": 1,
};

export function satisfactionToScore(raw: string | null): number | null {
  if (!raw) return null;
  return SATISFACTION_SCORE[raw.trim()] ?? null;
}

export async function ingestSurveySheet(
  uploadBatchId: string,
  sheet: ParsedSheet
): Promise<{ saved: number; errors: number }> {
  let saved = 0;
  let errors = 0;
  const records: Prisma.SurveyResponseCreateManyInput[] = [];

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const rowNum = i + 2;

    const str = (key: string) => {
      const v = row[key];
      if (v == null) return null;
      return String(v).trim() || null;
    };

    const centerRaw = str("방문센터");
    const center = normalizeCenter(centerRaw) ?? centerRaw;
    const nameRaw = str("이름");
    const phoneRaw = str("연락처");
    const responseDateRaw = row["등록일자"];
    const responseDate = parseExcelDate(responseDateRaw);

    const ageRaw = row["연령대"];
    const ageGroup = ageRaw != null && !isNaN(Number(ageRaw)) ? Math.floor(Number(ageRaw) / 10) * 10 : null;

    records.push({
      uploadBatchId,
      sheetName: sheet.sheetName,
      rowNumber: rowNum,
      center,
      respondentNameMasked: maskName(nameRaw),
      respondentKey: makeVisitorKey(nameRaw, phoneRaw),
      phoneHash: hashPhone(phoneRaw),
      gender: str("성별"),
      ageGroup,
      residence: str("거주지"),
      howFound: str("알게된 경로"),
      visitCount: str("방문횟수"),
      participatedPrograms: str("참여한 프로그램"),
      favoriteProgram: str("가장 흥미로웠던 프로그램"),
      programSatisfaction: str("프로그램 만족도"),
      operationSatisfaction: str("운영 만족도"),
      digitalHelpSatisfaction: str("향후 디지털기기 사용 도움 만족도"),
      willReturn: str("재방문여부"),
      responseDate,
      year: responseDate ? responseDate.getFullYear() : null,
      month: responseDate ? responseDate.getMonth() + 1 : null,
      rawJson: JSON.stringify(row),
    });
    saved++;
  }

  if (records.length > 0) {
    // LibSQL createMany can fail on large batches with DateTime fields; insert in chunks
    const CHUNK = 100;
    saved = 0;
    errors = 0;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      try {
        await prisma.surveyResponse.createMany({ data: chunk });
        saved += chunk.length;
      } catch {
        for (const record of chunk) {
          try {
            await prisma.surveyResponse.create({ data: record });
            saved++;
          } catch {
            errors++;
          }
        }
      }
    }
  }

  return { saved, errors };
}
