import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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
  const centerScope = session.centerScope !== "ALL" ? session.centerScope
    : centerFilter !== "ALL" ? centerFilter : null;

  const where: Prisma.EducationAttendanceWhereInput = {
    sheetName: { contains: "체험" },
    year,
    ...(month ? { month } : {}),
    ...(centerScope ? { center: centerScope } : {}),
  };

  // 전체 건수
  const total = await prisma.educationAttendance.count({ where });

  // 프로그램별 이용 건수 TOP 20
  const byProgram = await prisma.educationAttendance.groupBy({
    by: ["programName"],
    where: { ...where, programName: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });

  // 센터별 이용 건수
  const byCenter = await prisma.educationAttendance.groupBy({
    by: ["center"],
    where: { ...where, center: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  // 월별 추이
  const byMonth = await prisma.educationAttendance.groupBy({
    by: ["year", "month"],
    where: { ...where, year: { not: null }, month: { not: null } },
    _count: { id: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  // 일별 추이 (월 선택 시)
  let byDay: { date: string; count: number }[] = [];
  if (month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    const records = await prisma.educationAttendance.findMany({
      where: { ...where, educationDate: { gte: startDate, lt: endDate } },
      select: { educationDate: true },
    });
    const dayMap = new Map<string, number>();
    for (const r of records) {
      if (!r.educationDate) continue;
      const d = r.educationDate.toISOString().slice(0, 10);
      dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
    }
    byDay = Array.from(dayMap.entries())
      .sort()
      .map(([date, count]) => ({ date, count }));
  }

  return Response.json({
    total,
    byProgram: byProgram.map((r) => ({ name: r.programName ?? "미상", count: r._count.id })),
    byCenter: byCenter.map((r) => ({ center: r.center ?? "미상", count: r._count.id })),
    byMonth: byMonth.map((r) => ({
      month: `${r.year}-${String(r.month).padStart(2, "0")}`,
      count: r._count.id,
    })),
    byDay,
  });
}
