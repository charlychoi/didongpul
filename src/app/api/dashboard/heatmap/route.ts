import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;
  const centerFilter = searchParams.get("center") ?? "ALL";
  const centerScope =
    session.centerScope !== "ALL" ? session.centerScope : centerFilter !== "ALL" ? centerFilter : null;

  const startDate = new Date(year, month ? month - 1 : 0, 1);
  const endDate = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const daily = await prisma.dailyCenterSummary.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      ...(centerScope ? { center: centerScope } : {}),
    },
    select: {
      date: true,
      center: true,
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

  // Build hour-by-weekday heatmap
  const weekdayHourMap: Record<string, number> = {};
  const hourTotals: Record<number, number> = {};

  for (const d of daily) {
    const weekday = new Date(d.date).getDay(); // 0=Sun, 6=Sat
    const hourFields: [number, keyof typeof d][] = [
      [9, "entry9Count"], [10, "entry10Count"], [11, "entry11Count"],
      [12, "entry12Count"], [13, "entry13Count"], [14, "entry14Count"],
      [15, "entry15Count"], [16, "entry16Count"], [17, "entry17Count"],
      [18, "entry18Count"], [19, "entry19Count"], [20, "entry20Count"],
      [21, "entry21Count"],
    ];
    for (const [hour, field] of hourFields) {
      const count = (d[field] as number) ?? 0;
      const key = `${weekday}_${hour}`;
      weekdayHourMap[key] = (weekdayHourMap[key] ?? 0) + count;
      hourTotals[hour] = (hourTotals[hour] ?? 0) + count;
    }
  }

  const peakHour = Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0];
  const lowHour = Object.entries(hourTotals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => a[1] - b[1])[0];

  return Response.json({
    heatmap: weekdayHourMap,
    hourTotals,
    peakHour: peakHour ? { hour: parseInt(peakHour[0]), count: peakHour[1] } : null,
    lowHour: lowHour ? { hour: parseInt(lowHour[0]), count: lowHour[1] } : null,
  });
}
