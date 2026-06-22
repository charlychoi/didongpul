import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import KpiCard from "@/components/ui/KpiCard";
import InsightPanel from "@/components/ui/InsightPanel";
import Link from "next/link";

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

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "심각",
  warning: "경고",
  info: "정보",
};

export default async function QualityContent({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; page?: string }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const batchId = params.batchId;
  const page = parseInt(params.page ?? "1");
  const limit = 50;

  const where = batchId ? { uploadBatchId: batchId } : {};

  const [bySeverity, byIssueType, bySheet, issues, total] = await Promise.all([
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
    prisma.dataQualityLog.groupBy({
      by: ["sheetName"],
      where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    prisma.dataQualityLog.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.dataQualityLog.count({ where }),
  ]);

  const criticalCount = bySeverity.find((b) => b.severity === "critical")?._count.id ?? 0;
  const warningCount = bySeverity.find((b) => b.severity === "warning")?._count.id ?? 0;
  const infoCount = bySeverity.find((b) => b.severity === "info")?._count.id ?? 0;
  const qualityScore = Math.max(0, 100 - criticalCount * 3 - warningCount * 1 - infoCount * 0.2);

  const insights = [];
  if (criticalCount > 0) {
    insights.push({
      text: `심각 오류 ${criticalCount}건이 있습니다. 즉시 확인이 필요합니다.`,
      type: "warning" as const,
    });
  }
  if (warningCount > 0) {
    insights.push({
      text: `경고 ${warningCount}건이 있습니다. 원천 데이터를 확인해 주세요.`,
      type: "warning" as const,
    });
  }
  if (qualityScore >= 90) {
    insights.push({
      text: `데이터 품질 점수 ${qualityScore.toFixed(0)}점으로 양호한 상태입니다.`,
      type: "positive" as const,
    });
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="데이터 품질 점수"
          value={`${Math.round(qualityScore)}점`}
          color={qualityScore >= 80 ? "green" : qualityScore >= 60 ? "amber" : "red"}
        />
        <KpiCard title="심각 오류" value={criticalCount} color={criticalCount > 0 ? "red" : "gray"} />
        <KpiCard title="경고" value={warningCount} color={warningCount > 10 ? "amber" : "gray"} />
        <KpiCard title="정보" value={infoCount} color="gray" />
      </div>

      <InsightPanel insights={insights} title="품질 점검 인사이트" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">이슈 유형별 건수</h3>
          {byIssueType.length === 0 ? (
            <p className="text-sm text-gray-400">이슈 없음</p>
          ) : (
            <div className="space-y-1.5">
              {byIssueType.map((r) => (
                <div key={r.issueType} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {ISSUE_TYPE_LABELS[r.issueType] ?? r.issueType}
                  </span>
                  <span className="font-medium text-gray-900">{r._count.id}건</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">시트별 오류 건수 (상위 5)</h3>
          {bySheet.length === 0 ? (
            <p className="text-sm text-gray-400">이슈 없음</p>
          ) : (
            <div className="space-y-1.5">
              {bySheet.map((r) => (
                <div key={r.sheetName} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate max-w-[160px]" title={r.sheetName ?? ""}>
                    {r.sheetName ?? "(시트명 없음)"}
                  </span>
                  <span className="font-medium text-gray-900">{r._count.id}건</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">심각도별 건수</h3>
          {bySeverity.length === 0 ? (
            <p className="text-sm text-gray-400">이슈 없음</p>
          ) : (
            <div className="space-y-2">
              {bySeverity.map((r) => (
                <div key={r.severity} className="flex items-center justify-between">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[r.severity] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {SEVERITY_LABELS[r.severity] ?? r.severity}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{r._count.id}건</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-700">
            이상 데이터 목록 ({total.toLocaleString()}건)
          </h3>
          <a
            href={batchId ? `/api/download/quality?batchId=${batchId}` : "/api/download/quality"}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Excel 다운로드
          </a>
        </div>
        {issues.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">품질 이슈가 없습니다.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">심각도</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">이슈 유형</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">시트</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">행</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">내용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {issues.map((issue) => (
                    <tr key={issue.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEVERITY_BADGE[issue.severity] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs">
                        {ISSUE_TYPE_LABELS[issue.issueType] ?? issue.issueType}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs max-w-[160px] truncate">
                        {issue.sheetName ?? "-"}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{issue.rowNumber ?? "-"}</td>
                      <td className="px-4 py-2 text-gray-700 text-xs">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 px-4 py-3 border-t border-gray-100">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`?${batchId ? `batchId=${batchId}&` : ""}page=${p}`}
                    className={`w-8 h-8 flex items-center justify-center text-xs rounded ${p === page ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    {p}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
