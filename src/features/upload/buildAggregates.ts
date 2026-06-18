import { prisma } from "@/lib/prisma";
import { CENTERS } from "../normalization/normalizeCenter";

export async function rebuildDailySummary(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const logs = await prisma.cleanVisitLog.findMany({
    where: {
      visitDate: { gte: startDate, lt: endDate },
      isInvalidStay: false,
    },
    select: {
      center: true,
      visitDate: true,
      visitorKey: true,
      stayMinutes: true,
      isLongStay: true,
      entryHour: true,
    },
  });

  // Group by date+center
  const map = new Map<
    string,
    {
      center: string;
      date: Date;
      visits: number;
      keys: Set<string>;
      stays: number[];
      longStay: number;
      hours: Record<number, number>;
    }
  >();

  for (const log of logs) {
    if (!log.visitDate || !log.center) continue;
    const key = `${log.visitDate.toISOString().slice(0, 10)}_${log.center}`;
    if (!map.has(key)) {
      map.set(key, {
        center: log.center,
        date: log.visitDate,
        visits: 0,
        keys: new Set(),
        stays: [],
        longStay: 0,
        hours: {},
      });
    }
    const entry = map.get(key)!;
    entry.visits++;
    if (log.visitorKey) entry.keys.add(log.visitorKey);
    if (log.stayMinutes != null) entry.stays.push(log.stayMinutes);
    if (log.isLongStay) entry.longStay++;
    if (log.entryHour != null) {
      entry.hours[log.entryHour] = (entry.hours[log.entryHour] ?? 0) + 1;
    }
  }

  for (const [, agg] of map) {
    const avgStay =
      agg.stays.length > 0 ? agg.stays.reduce((a, b) => a + b, 0) / agg.stays.length : null;
    const median = agg.stays.length > 0 ? calcMedian(agg.stays) : null;

    await prisma.dailyCenterSummary.upsert({
      where: { date_center: { date: agg.date, center: agg.center } },
      create: {
        date: agg.date,
        center: agg.center,
        visitCount: agg.visits,
        uniqueVisitorCount: agg.keys.size,
        avgStayMinutes: avgStay,
        medianStayMinutes: median,
        longStayCount: agg.longStay,
        entry9Count: agg.hours[9] ?? 0,
        entry10Count: agg.hours[10] ?? 0,
        entry11Count: agg.hours[11] ?? 0,
        entry12Count: agg.hours[12] ?? 0,
        entry13Count: agg.hours[13] ?? 0,
        entry14Count: agg.hours[14] ?? 0,
        entry15Count: agg.hours[15] ?? 0,
        entry16Count: agg.hours[16] ?? 0,
        entry17Count: agg.hours[17] ?? 0,
        entry18Count: agg.hours[18] ?? 0,
        entry19Count: agg.hours[19] ?? 0,
        entry20Count: agg.hours[20] ?? 0,
        entry21Count: agg.hours[21] ?? 0,
      },
      update: {
        visitCount: agg.visits,
        uniqueVisitorCount: agg.keys.size,
        avgStayMinutes: avgStay,
        medianStayMinutes: median,
        longStayCount: agg.longStay,
        entry9Count: agg.hours[9] ?? 0,
        entry10Count: agg.hours[10] ?? 0,
        entry11Count: agg.hours[11] ?? 0,
        entry12Count: agg.hours[12] ?? 0,
        entry13Count: agg.hours[13] ?? 0,
        entry14Count: agg.hours[14] ?? 0,
        entry15Count: agg.hours[15] ?? 0,
        entry16Count: agg.hours[16] ?? 0,
        entry17Count: agg.hours[17] ?? 0,
        entry18Count: agg.hours[18] ?? 0,
        entry19Count: agg.hours[19] ?? 0,
        entry20Count: agg.hours[20] ?? 0,
        entry21Count: agg.hours[21] ?? 0,
      },
    });
  }
}

export async function rebuildMonthlySummary(year: number, month: number) {
  for (const center of CENTERS) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const logs = await prisma.cleanVisitLog.findMany({
      where: {
        center,
        visitDate: { gte: startDate, lt: endDate },
        isInvalidStay: false,
      },
      select: { visitorKey: true, stayMinutes: true, isLongStay: true },
    });

    if (logs.length === 0) continue;

    const uniqueKeys = new Set(logs.map((l) => l.visitorKey).filter(Boolean));
    const validStays = logs.map((l) => l.stayMinutes).filter((v): v is number => v != null);
    const avgStay =
      validStays.length > 0 ? validStays.reduce((a, b) => a + b, 0) / validStays.length : null;
    const longStayCount = logs.filter((l) => l.isLongStay).length;
    const avgVisits = uniqueKeys.size > 0 ? logs.length / uniqueKeys.size : null;

    const workingDays = await getWorkingDays(year, month, center);
    const avgDailyVisit = workingDays > 0 ? logs.length / workingDays : null;

    const eduCount = await prisma.educationAttendance.count({
      where: { center, year, month, attendanceStatus: "참석" },
    });

    const topProgram = await getTopProgram(center, year, month);

    await prisma.monthlyCenterSummary.upsert({
      where: { year_month_center: { year, month, center } },
      create: {
        year,
        month,
        center,
        visitCount: logs.length,
        uniqueVisitorCount: uniqueKeys.size,
        avgVisitsPerVisitor: avgVisits,
        avgDailyVisitCount: avgDailyVisit,
        avgStayMinutes: avgStay,
        longStayCount,
        educationAttendanceCount: eduCount,
        topProgramName: topProgram,
      },
      update: {
        visitCount: logs.length,
        uniqueVisitorCount: uniqueKeys.size,
        avgVisitsPerVisitor: avgVisits,
        avgDailyVisitCount: avgDailyVisit,
        avgStayMinutes: avgStay,
        longStayCount,
        educationAttendanceCount: eduCount,
        topProgramName: topProgram,
      },
    });
  }
}

async function getWorkingDays(year: number, month: number, center: string): Promise<number> {
  const result = await prisma.dailyCenterSummary.count({
    where: {
      center,
      date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) },
      visitCount: { gt: 0 },
    },
  });
  return result;
}

async function getTopProgram(
  center: string,
  year: number,
  month: number
): Promise<string | null> {
  const result = await prisma.educationAttendance.groupBy({
    by: ["programName"],
    where: { center, year, month, attendanceStatus: "참석", programName: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });
  return result[0]?.programName ?? null;
}

function calcMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
