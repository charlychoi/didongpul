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

  const centerScope =
    session.centerScope !== "ALL" ? session.centerScope : centerFilter !== "ALL" ? centerFilter : null;

  const where: Prisma.MonthlyCenterSummaryWhereInput = {
    year,
    ...(month ? { month } : {}),
    ...(centerScope ? { center: centerScope } : {}),
  };

  const monthly = await prisma.monthlyCenterSummary.findMany({
    where,
    orderBy: [{ year: "asc" }, { month: "asc" }, { center: "asc" }],
  });

  const totalVisits = monthly.reduce((s, r) => s + r.visitCount, 0);
  const totalUnique = monthly.reduce((s, r) => s + r.uniqueVisitorCount, 0);
  const avgStay =
    monthly.length > 0
      ? monthly.reduce((s, r) => s + (r.avgStayMinutes ?? 0), 0) / monthly.length
      : null;
  const totalLongStay = monthly.reduce((s, r) => s + r.longStayCount, 0);
  const totalEduAttendance = monthly.reduce((s, r) => s + r.educationAttendanceCount, 0);

  const startDate = new Date(year, month ? month - 1 : 0, 1);
  const endDate = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const dailyWhere: Prisma.DailyCenterSummaryWhereInput = {
    date: { gte: startDate, lt: endDate },
    ...(centerScope ? { center: centerScope } : {}),
  };

  const daily = await prisma.dailyCenterSummary.findMany({
    where: dailyWhere,
    orderBy: { date: "asc" },
  });

  const qualityIssues = await prisma.dataQualityLog.groupBy({
    by: ["severity"],
    _count: { id: true },
  });
  const criticalCount = qualityIssues.find((q) => q.severity === "critical")?._count.id ?? 0;
  const warningCount = qualityIssues.find((q) => q.severity === "warning")?._count.id ?? 0;
  const infoCount = qualityIssues.find((q) => q.severity === "info")?._count.id ?? 0;
  const qualityScore = Math.max(0, 100 - criticalCount * 3 - warningCount - infoCount * 0.2);

  return Response.json({
    kpi: {
      totalVisits,
      totalUnique,
      avgVisitsPerVisitor: totalUnique > 0 ? totalVisits / totalUnique : null,
      avgStayMinutes: avgStay,
      totalLongStay,
      totalEduAttendance,
      qualityScore: Math.round(qualityScore * 10) / 10,
    },
    monthly,
    daily,
  });
}
