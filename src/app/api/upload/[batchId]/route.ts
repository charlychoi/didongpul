import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { rebuildDailySummary, rebuildMonthlySummary } from "@/features/upload/buildAggregates";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { batchId } = await params;

  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return Response.json({ error: "배치를 찾을 수 없습니다." }, { status: 404 });
  }
  if (batch.status === "processing") {
    return Response.json(
      { error: "처리 중인 동기화/업로드는 완료 후 삭제할 수 있습니다." },
      { status: 409 }
    );
  }

  // 이 배치의 raw_visit_logs → 영향받는 연월 파악
  const affectedMonths = await prisma.rawVisitLog.findMany({
    where: { uploadBatchId: batchId },
    select: { id: true },
  });
  const rawIds = affectedMonths.map((r) => r.id);

  // 영향받는 clean_visit_logs의 연월 수집 (aggregate 재계산용)
  const affectedClean = await prisma.cleanVisitLog.findMany({
    where: { rawVisitId: { in: rawIds } },
    select: { year: true, month: true, center: true },
  });

  const monthSet = new Set<string>();
  for (const c of affectedClean) {
    if (c.year && c.month) monthSet.add(`${c.year}-${c.month}`);
  }

  // 삭제 순서: FK 참조 역순
  // 1. clean_visit_logs
  if (rawIds.length > 0) {
    await prisma.cleanVisitLog.deleteMany({ where: { rawVisitId: { in: rawIds } } });
  }
  // 2. raw_visit_logs
  await prisma.rawVisitLog.deleteMany({ where: { uploadBatchId: batchId } });
  // 3. raw_excel_rows
  await prisma.rawExcelRow.deleteMany({ where: { uploadBatchId: batchId } });
  // 4. education_attendance
  await prisma.educationAttendance.deleteMany({ where: { uploadBatchId: batchId } });
  // 5. survey_responses
  await prisma.surveyResponse.deleteMany({ where: { uploadBatchId: batchId } });
  // 6. data_quality_logs
  await prisma.dataQualityLog.deleteMany({ where: { uploadBatchId: batchId } });
  // 7. upload_batch
  await prisma.uploadBatch.delete({ where: { id: batchId } });

  // 영향받은 연월에 대해 집계 재계산
  for (const ym of monthSet) {
    const [y, m] = ym.split("-").map(Number);

    // 해당 월의 daily/monthly summary 삭제 후 재계산
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 1);

    await prisma.dailyCenterSummary.deleteMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
    });
    await prisma.monthlyCenterSummary.deleteMany({ where: { year: y, month: m } });

    // 남은 clean 데이터로 재계산
    const hasRemaining = await prisma.cleanVisitLog.count({
      where: { year: y, month: m },
    });
    if (hasRemaining > 0) {
      await rebuildDailySummary(y, m);
      await rebuildMonthlySummary(y, m);
    }
  }

  return Response.json({ ok: true });
}
