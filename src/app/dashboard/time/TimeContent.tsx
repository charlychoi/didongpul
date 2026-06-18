import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import InsightPanel from "@/components/ui/InsightPanel";
import KpiCard from "@/components/ui/KpiCard";
import TimeCharts from "./TimeCharts";

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function TimeContent({
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

  const startDate = new Date(year, month ? month - 1 : 0, 1);
  const endDate = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const daily = await prisma.dailyCenterSummary.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      ...(centerScope ? { center: centerScope } : {}),
    },
    select: {
      date: true, center: true,
      entry9Count: true, entry10Count: true, entry11Count: true,
      entry12Count: true, entry13Count: true, entry14Count: true,
      entry15Count: true, entry16Count: true, entry17Count: true,
      entry18Count: true, entry19Count: true, entry20Count: true,
      entry21Count: true,
    },
  });

  // Hour totals
  const hourTotals: Record<number, number> = {};
  const weekdayHourMap: Record<string, number> = {};

  for (const d of daily) {
    const weekday = new Date(d.date).getDay();
    const fieldMap: [number, keyof typeof d][] = [
      [9, "entry9Count"], [10, "entry10Count"], [11, "entry11Count"],
      [12, "entry12Count"], [13, "entry13Count"], [14, "entry14Count"],
      [15, "entry15Count"], [16, "entry16Count"], [17, "entry17Count"],
      [18, "entry18Count"], [19, "entry19Count"], [20, "entry20Count"],
      [21, "entry21Count"],
    ];
    for (const [h, f] of fieldMap) {
      const count = (d[f] as number) ?? 0;
      hourTotals[h] = (hourTotals[h] ?? 0) + count;
      const key = `${weekday}_${h}`;
      weekdayHourMap[key] = (weekdayHourMap[key] ?? 0) + count;
    }
  }

  const sortedHours = Object.entries(hourTotals).sort((a, b) => b[1] - a[1]);
  const peakHour = sortedHours[0];
  const lowHour = sortedHours.filter(([, v]) => v > 0).at(-1);

  const insights = [];
  if (peakHour) {
    insights.push({
      text: `방문이 가장 집중되는 시간대는 ${peakHour[0]}시입니다 (${Number(peakHour[1]).toLocaleString()}명).`,
      type: "info" as const,
    });
  }
  if (lowHour) {
    insights.push({
      text: `방문이 가장 적은 시간대는 ${lowHour[0]}시입니다 (${Number(lowHour[1]).toLocaleString()}명).`,
      type: "info" as const,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard
          title="피크 시간대"
          value={peakHour ? `${peakHour[0]}시` : "-"}
          subtitle={peakHour ? `${Number(peakHour[1]).toLocaleString()}명` : ""}
          color="blue"
        />
        <KpiCard
          title="저활용 시간대"
          value={lowHour ? `${lowHour[0]}시` : "-"}
          subtitle={lowHour ? `${Number(lowHour[1]).toLocaleString()}명` : ""}
          color="gray"
        />
        <KpiCard
          title="분석 일수"
          value={`${new Set(daily.map((d) => d.date.toISOString().slice(0, 10))).size}일`}
          color="gray"
        />
      </div>

      <InsightPanel insights={insights} title="시간대 분석 인사이트" />

      <TimeCharts
        hourData={HOURS.map((h) => ({ hour: `${h}시`, count: hourTotals[h] ?? 0 }))}
        heatmapData={weekdayHourMap}
        hours={HOURS}
        weekdays={WEEKDAYS}
      />
    </div>
  );
}
