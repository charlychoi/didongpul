import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as XLSX from "xlsx";

const ISSUE_TYPE_LABELS: Record<string, string> = {
  missing_required_value: "필수값 누락",
  invalid_date: "날짜 변환 실패",
  invalid_stay_time: "체류시간 오류",
  long_stay: "장시간 체류",
  center_normalization: "센터명 표준화 실패",
  phone_missing: "연락처 누락",
  duplicate_suspected: "중복 의심",
  unknown_sheet_format: "알 수 없는 시트",
  education_normalization: "교육 참석값 표준화 실패",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "심각",
  warning: "경고",
  info: "정보",
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId") ?? undefined;
  const where = batchId ? { uploadBatchId: batchId } : {};

  const [issues, bySeverity, byIssueType] = await Promise.all([
    prisma.dataQualityLog.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 10000,
    }),
    prisma.dataQualityLog.groupBy({
      by: ["severity"],
      where,
      _count: { id: true },
    }),
    prisma.dataQualityLog.groupBy({
      by: ["issueType"],
      where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  const wb = XLSX.utils.book_new();

  // Sheet 1: 요약
  const criticalCount = bySeverity.find((b) => b.severity === "critical")?._count.id ?? 0;
  const warningCount = bySeverity.find((b) => b.severity === "warning")?._count.id ?? 0;
  const infoCount = bySeverity.find((b) => b.severity === "info")?._count.id ?? 0;
  const qualityScore = Math.max(0, 100 - criticalCount * 3 - warningCount * 1 - infoCount * 0.2);

  const summaryRows = [
    ["데이터 품질 점검 요약"],
    [],
    ["항목", "건수"],
    ["전체 이슈", issues.length],
    ["심각 오류", criticalCount],
    ["경고", warningCount],
    ["정보", infoCount],
    ["품질 점수", `${Math.round(qualityScore)}점`],
    [],
    ["이슈 유형별"],
    ["이슈 유형", "건수"],
    ...byIssueType.map((r) => [ISSUE_TYPE_LABELS[r.issueType] ?? r.issueType, r._count.id]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1["!cols"] = [{ wch: 28 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, "요약");

  // Sheet 2: 상세 목록
  const detailRows = [
    ["심각도", "이슈 유형", "시트명", "행 번호", "내용", "생성일"],
    ...issues.map((i) => [
      SEVERITY_LABELS[i.severity] ?? i.severity,
      ISSUE_TYPE_LABELS[i.issueType] ?? i.issueType,
      i.sheetName ?? "",
      i.rowNumber ?? "",
      i.message,
      new Date(i.createdAt).toLocaleString("ko-KR"),
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(detailRows);
  ws2["!cols"] = [{ wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 60 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, "이상 데이터 목록");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const timestamp = new Date().toISOString().slice(0, 10);

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="quality_check_${timestamp}.xlsx"`,
    },
  });
}
