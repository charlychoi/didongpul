import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import KpiCard from "@/components/ui/KpiCard";
import InsightPanel from "@/components/ui/InsightPanel";
import { generateOverviewInsights } from "@/features/analytics/insightGenerator";
import OverviewCharts from "./OverviewCharts";
import ReportDownloadButton from "./ReportDownloadButton";

function calcTrend(current: number, prev: number, label: string) {
  if (prev === 0) return undefined;
  return { pct: ((current - prev) / prev) * 100, label };
}

async function fetchPeriodSummary(
  year: number,
  month: number | null,
  centerScope: string | null
) {
  const monthly = await prisma.monthlyCenterSummary.findMany({
    where: {
      year,
      ...(month ? { month } : {}),
      ...(centerScope ? { center: centerScope } : {}),
    },
    orderBy: [{ month: "asc" }, { center: "asc" }],
  });
  const totalVisits = monthly.reduce((s, r) => s + r.visitCount, 0);
  const totalUnique = monthly.reduce((s, r) => s + r.uniqueVisitorCount, 0);
  const validStay = monthly.filter((r) => r.avgStayMinutes);
  const avgStay =
    validStay.length > 0
      ? validStay.reduce((s, r) => s + (r.avgStayMinutes ?? 0), 0) / validStay.length
      : null;
  const totalLongStay = monthly.reduce((s, r) => s + r.longStayCount, 0);
  const totalEduAttendance = monthly.reduce((s, r) => s + r.educationAttendanceCount, 0);
  return { totalVisits, totalUnique, avgStay, totalLongStay, totalEduAttendance, monthly };
}

export default async function OverviewContent({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;

  const year = parseInt(params.year ?? String(new Date().getFullYear()));
  const month = params.month ? parseInt(params.month) : null;
  const centerParam = params.center ?? "ALL";
  const centerScope =
    session.centerScope !== "ALL" ? session.centerScope : centerParam !== "ALL" ? centerParam : null;

  // ── Current + previous period (전월 or 전년)
  let prevYear = year;
  let prevMonth: number | null = null;
  let trendLabel = "전년比";

  if (month) {
    prevYear = month === 1 ? year - 1 : year;
    prevMonth = month === 1 ? 12 : month - 1;
    trendLabel = "전월比";
  } else {
    prevYear = year - 1;
  }

  const [current, prev] = await Promise.all([
    fetchPeriodSummary(year, month, centerScope),
    fetchPeriodSummary(prevYear, prevMonth, centerScope),
  ]);

  // ── Quality score (rate-based, not absolute count)
  const [qualityIssues, totalRecords] = await Promise.all([
    prisma.dataQualityLog.groupBy({
      by: ["severity", "issueType"],
      _count: { id: true },
    }),
    prisma.cleanVisitLog.count(),
  ]);

  const criticalCount = qualityIssues
    .filter((q) => q.severity === "critical")
    .reduce((s, q) => s + q._count.id, 0);
  const longStayCount = qualityIssues
    .filter((q) => q.issueType === "long_stay")
    .reduce((s, q) => s + q._count.id, 0);
  const duplicateCount = qualityIssues
    .filter((q) => q.issueType === "duplicate_visit")
    .reduce((s, q) => s + q._count.id, 0);
  const otherWarningCount = qualityIssues
    .filter((q) => q.severity === "warning" && q.issueType !== "long_stay")
    .reduce((s, q) => s + q._count.id, 0);

  const base = Math.max(totalRecords, 1);
  const qualityScore = Math.max(
    0,
    Math.round(
      (100
        - (criticalCount / base) * 100 * 5
        - (longStayCount / base) * 100 * 0.3
        - (otherWarningCount / base) * 100 * 2
        - (duplicateCount / base) * 100 * 0.5
      ) * 10
    ) / 10
  );

  // ── Center breakdown
  const byCenterVisits: Record<string, number> = {};
  for (const r of current.monthly) {
    byCenterVisits[r.center] = (byCenterVisits[r.center] ?? 0) + r.visitCount;
  }

  // ── Daily trend
  const startDate = new Date(year, month ? month - 1 : 0, 1);
  const endDate = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
  const daily = await prisma.dailyCenterSummary.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      ...(centerScope ? { center: centerScope } : {}),
    },
    orderBy: { date: "asc" },
    select: {
      date: true,
      center: true,
      visitCount: true,
      uniqueVisitorCount: true,
      avgStayMinutes: true,
      entry9Count: true,
      entry10Count: true,
      entry11Count: true,
      entry12Count: true,
      entry13Count: true,
      entry14Count: true,
      entry15Count: true,
      entry16Count: true,
      entry17Count: true,
      entry18Count: true,
      entry19Count: true,
      entry20Count: true,
      entry21Count: true,
    },
  });

  // ── Peak hour
  const hourTotals: Record<number, number> = {};
  for (const d of daily) {
    const fields: [number, keyof typeof d][] = [
      [9, "entry9Count"], [10, "entry10Count"], [11, "entry11Count"],
      [12, "entry12Count"], [13, "entry13Count"], [14, "entry14Count"],
      [15, "entry15Count"], [16, "entry16Count"], [17, "entry17Count"],
      [18, "entry18Count"], [19, "entry19Count"], [20, "entry20Count"],
      [21, "entry21Count"],
    ];
    for (const [h, f] of fields) {
      hourTotals[h] = (hourTotals[h] ?? 0) + ((d[f] as number) ?? 0);
    }
  }
  const peakHour =
    Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0]?.[0] != null
      ? parseInt(Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0][0])
      : null;

  // 실제 데이터 날짜 범위 (daily 데이터 첫/마지막 날짜 기준)
  const dailyDates = [...new Set(daily.map((d) => d.date.toISOString().slice(0, 10)))].sort();
  const periodLabel =
    dailyDates.length > 0
      ? `${dailyDates[0]} ~ ${dailyDates[dailyDates.length - 1]}`
      : month
      ? `${year}년 ${month}월`
      : `${year}년 전체`;

  const insights = generateOverviewInsights({
    totalVisits: current.totalVisits,
    totalUnique: current.totalUnique,
    avgStayMinutes: current.avgStay,
    totalLongStay: current.totalLongStay,
    totalEduAttendance: current.totalEduAttendance,
    qualityScore,
    byCenterVisits,
    peakHour,
  });

  const formatStay = (min: number | null) => {
    if (min == null) return "-";
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="총 방문건수"
          value={current.totalVisits.toLocaleString()}
          subtitle="전체 입장 건수"
          color="blue"
          trend={calcTrend(current.totalVisits, prev.totalVisits, trendLabel)}
        />
        <KpiCard
          title="고유 방문자"
          value={current.totalUnique.toLocaleString()}
          subtitle="연락처 기준 고유 수"
          color="green"
          trend={calcTrend(current.totalUnique, prev.totalUnique, trendLabel)}
        />
        <KpiCard
          title="1인당 평균 방문"
          value={
            current.totalUnique > 0
              ? `${(current.totalVisits / current.totalUnique).toFixed(1)}회`
              : "-"
          }
          subtitle="방문건수 / 고유방문자"
          color="purple"
        />
        <KpiCard
          title="평균 체류시간"
          value={formatStay(current.avgStay)}
          subtitle="입퇴장 기록 기준"
          color="blue"
        />
        <KpiCard
          title="장시간 체류"
          value={current.totalLongStay.toLocaleString()}
          subtitle="10시간 이상 체류 건수"
          color={current.totalLongStay > 10 ? "amber" : "gray"}
          trend={calcTrend(current.totalLongStay, prev.totalLongStay, trendLabel)}
        />
        <KpiCard
          title="교육 참석 인원"
          value={current.totalEduAttendance.toLocaleString()}
          subtitle="출석 확인 기준"
          color="green"
          trend={calcTrend(current.totalEduAttendance, prev.totalEduAttendance, trendLabel)}
        />
        <KpiCard
          title="데이터 품질 점수"
          value={`${qualityScore}점`}
          subtitle="100점 만점"
          color={qualityScore >= 80 ? "green" : qualityScore >= 60 ? "amber" : "red"}
        />
        <KpiCard
          title="분석 데이터 월수"
          value={`${
            current.monthly.length > 0
              ? new Set(current.monthly.map((r) => `${r.year}-${r.month}`)).size
              : 0
          }개월`}
          subtitle={`${year}년 ${month ? month + "월" : "전체"}`}
          color="gray"
        />
      </div>

      <InsightPanel insights={insights} period={periodLabel} />

      <div className="flex justify-end gap-2">
        <ReportDownloadButton year={year} month={month} center={centerParam} periodLabel={periodLabel} />
      </div>

      <OverviewCharts
        daily={daily.map((d) => ({
          ...d,
          date: d.date.toISOString().slice(0, 10),
        }))}
        monthly={current.monthly}
        byCenterVisits={byCenterVisits}
        year={year}
        month={month}
      />
    </div>
  );
}
