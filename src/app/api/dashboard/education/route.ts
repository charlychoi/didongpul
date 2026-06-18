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

  const where: Prisma.EducationAttendanceWhereInput = {
    year,
    ...(month ? { month } : {}),
    ...(centerScope ? { center: centerScope } : {}),
  };

  // By center
  const byCenter = await prisma.educationAttendance.groupBy({
    by: ["center"],
    where: { ...where, attendanceStatus: "참석" },
    _count: { id: true },
  });

  // By month trend
  const byMonth = await prisma.educationAttendance.groupBy({
    by: ["year", "month"],
    where: { ...where, attendanceStatus: "참석" },
    _count: { id: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  // Top programs
  const topPrograms = await prisma.educationAttendance.groupBy({
    by: ["programName"],
    where: { ...where, attendanceStatus: "참석", programName: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  // Attendance distribution
  const distribution = await prisma.educationAttendance.groupBy({
    by: ["attendanceStatus"],
    where,
    _count: { id: true },
  });

  return Response.json({ byCenter, byMonth, topPrograms, distribution });
}
