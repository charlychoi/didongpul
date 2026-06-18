import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import InsightPanel from "@/components/ui/InsightPanel";
import { generateCenterTypeLabel } from "@/features/analytics/insightGenerator";
import CentersCharts from "./CentersCharts";

const CENTERS = ["강동센터", "도봉센터", "동대문센터"];

export default async function CentersContent({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const year = parseInt(params.year ?? String(new Date().getFullYear()));
  const month = params.month ? parseInt(params.month) : null;

  const centerScope = session.centerScope !== "ALL" ? [session.centerScope] : CENTERS;

  const where = {
    year,
    ...(month ? { month } : {}),
    center: { in: centerScope },
  };

  const monthly = await prisma.monthlyCenterSummary.findMany({
    where,
    orderBy: [{ month: "asc" }, { center: "asc" }],
  });

  // Aggregate per center
  const byCenter: Record<
    string,
    {
      visits: number;
      unique: number;
      longStay: number;
      stays: number[];
      edu: number;
      avgVisitPerVisitor: number | null;
      avgDailyVisit: number | null;
    }
  > = {};

  for (const c of centerScope) {
    byCenter[c] = { visits: 0, unique: 0, longStay: 0, stays: [], edu: 0, avgVisitPerVisitor: null, avgDailyVisit: null };
  }

  for (const r of monthly) {
    const agg = byCenter[r.center];
    if (!agg) continue;
    agg.visits += r.visitCount;
    agg.unique += r.uniqueVisitorCount;
    agg.longStay += r.longStayCount;
    agg.edu += r.educationAttendanceCount;
    if (r.avgStayMinutes) agg.stays.push(r.avgStayMinutes);
    if (r.avgVisitsPerVisitor) agg.avgVisitPerVisitor = r.avgVisitsPerVisitor;
    if (r.avgDailyVisitCount) agg.avgDailyVisit = r.avgDailyVisitCount;
  }

  const insights = centerScope.map((c) => {
    const agg = byCenter[c];
    const avgStay = agg.stays.length > 0 ? agg.stays.reduce((a, b) => a + b, 0) / agg.stays.length : null;
    const typeLabel = generateCenterTypeLabel(c, agg.unique, avgStay, agg.avgVisitPerVisitor, agg.avgDailyVisit);
    return { text: `${c}: ${typeLabel} (방문 ${agg.visits.toLocaleString()}건, 고유 ${agg.unique.toLocaleString()}명)`, type: "info" as const };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {centerScope.map((c) => {
          const agg = byCenter[c];
          const avgStay =
            agg.stays.length > 0 ? agg.stays.reduce((a, b) => a + b, 0) / agg.stays.length : null;
          const typeLabel = generateCenterTypeLabel(c, agg.unique, avgStay, agg.avgVisitPerVisitor, agg.avgDailyVisit);

          return (
            <div key={c} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">{c}</h3>
                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                  {typeLabel}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">방문건수</span>
                  <span className="font-medium">{agg.visits.toLocaleString()}건</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">고유 방문자</span>
                  <span className="font-medium">{agg.unique.toLocaleString()}명</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">1인당 방문빈도</span>
                  <span className="font-medium">
                    {agg.unique > 0 ? (agg.visits / agg.unique).toFixed(1) : "-"}회
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">평균 체류시간</span>
                  <span className="font-medium">
                    {avgStay ? `${Math.round(avgStay)}분` : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">장시간 체류</span>
                  <span className={`font-medium ${agg.longStay > 5 ? "text-amber-600" : ""}`}>
                    {agg.longStay}건
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">교육 참석</span>
                  <span className="font-medium">{agg.edu.toLocaleString()}명</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <InsightPanel insights={insights} title="센터별 운영 유형 분석" />

      <CentersCharts
        monthly={monthly.map((r) => ({
          ...r,
          avgStayMinutes: r.avgStayMinutes,
          avgVisitsPerVisitor: r.avgVisitsPerVisitor,
        }))}
        centers={centerScope}
      />
    </div>
  );
}
