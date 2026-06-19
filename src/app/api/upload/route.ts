import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parseExcelBuffer, computeFileHash } from "@/features/upload/parseExcel";
import { ingestVisitSheet } from "@/features/upload/ingestVisitData";
import { ingestEducationSheet } from "@/features/upload/ingestEducationData";
import { ingestSurveySheet } from "@/features/upload/ingestSurveyData";
import { rebuildDailySummary, rebuildMonthlySummary } from "@/features/upload/buildAggregates";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  const validExts = [".xlsx", ".xls"];
  const fileName = file.name.toLowerCase();
  if (!validExts.some((ext) => fileName.endsWith(ext))) {
    return Response.json(
      { error: "Excel 파일(.xlsx, .xls)만 업로드할 수 있습니다." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = computeFileHash(buffer);

  // 중복 파일 확인
  const existing = await prisma.uploadBatch.findFirst({ where: { fileHash } });
  if (existing) {
    return Response.json(
      {
        error: "중복 파일",
        message: `이미 업로드된 파일입니다. (${new Date(existing.uploadedAt).toLocaleString("ko-KR")})`,
        existingBatchId: existing.id,
      },
      { status: 409 }
    );
  }

  // 파싱
  let parsed;
  try {
    parsed = parseExcelBuffer(buffer);
  } catch (e) {
    return Response.json({ error: "파일 파싱 오류: " + String(e) }, { status: 400 });
  }

  // 배치 생성
  const batch = await prisma.uploadBatch.create({
    data: {
      originalFilename: file.name,
      fileHash,
      uploadedById: session.userId,
      detectedSheetsCount: parsed.sheets.length,
      status: "processing",
    },
  });

  // 처리 중 오류 시 반드시 status를 failed로 업데이트
  try {
    let totalSaved = 0;
    let totalErrors = 0;
    const affectedMonths = new Set<string>();

    for (const sheet of parsed.sheets) {
      if (sheet.sheetType === "master_visit_db" || sheet.sheetType === "monthly_time_visit_detail") {
        const result = await ingestVisitSheet(batch.id, sheet);
        totalSaved += result.saved;
        totalErrors += result.errors;
      } else if (
        sheet.sheetType === "education_attendance_db" ||
        sheet.sheetType === "education_detail"
      ) {
        const result = await ingestEducationSheet(batch.id, sheet);
        totalSaved += result.saved;
        totalErrors += result.errors;
      } else if (sheet.sheetType === "survey_results") {
        const result = await ingestSurveySheet(batch.id, sheet);
        totalSaved += result.saved;
        totalErrors += result.errors;
      } else if (sheet.sheetType === "unknown") {
        await prisma.dataQualityLog.create({
          data: {
            uploadBatchId: batch.id,
            issueType: "unknown_sheet_format",
            severity: "info",
            sheetName: sheet.sheetName,
            message: `알 수 없는 시트 형식: "${sheet.sheetName}" (${sheet.rows.length}행) - 건너뜀`,
          },
        });
      }
    }

    // 집계 재빌드
    const visitDates = await prisma.cleanVisitLog.findMany({
      where: { rawVisitLog: { uploadBatchId: batch.id } },
      select: { year: true, month: true },
      distinct: ["year", "month"],
    });

    for (const { year, month } of visitDates) {
      if (year && month) {
        affectedMonths.add(`${year}-${month}`);
        await rebuildDailySummary(year, month);
        await rebuildMonthlySummary(year, month);
      }
    }

    const dupCount = await prisma.dataQualityLog.count({
      where: { uploadBatchId: batch.id, issueType: "duplicate_visit" },
    });

    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        status: "completed",
        rowCountTotal: totalSaved,
        duplicateCount: dupCount,
      },
    });

    return Response.json({
      success: true,
      batchId: batch.id,
      fileName: file.name,
      sheets: parsed.sheets.map((s) => ({
        name: s.sheetName,
        type: s.sheetType,
        rows: s.rows.length,
      })),
      totalSaved,
      totalErrors,
      affectedMonths: Array.from(affectedMonths),
    });
  } catch (err) {
    // 처리 실패 시 상태를 failed로 기록
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { status: "failed" },
    }).catch(() => {});

    console.error("[upload] processing error:", err);
    return Response.json(
      { error: "처리 중 오류가 발생했습니다: " + String(err) },
      { status: 500 }
    );
  }
}
