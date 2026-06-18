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
  const center = searchParams.get("center");
  const centerScope =
    session.centerScope !== "ALL" ? session.centerScope : center && center !== "ALL" ? center : null;

  const data = await prisma.monthlyCenterSummary.findMany({
    where: {
      year,
      ...(centerScope ? { center: centerScope } : {}),
    },
    orderBy: [{ month: "asc" }, { center: "asc" }],
  });

  const header =
    "연도,월,센터,방문건수,고유방문자,1인당방문빈도,일평균방문건수,평균체류시간(분),장시간체류건수,교육참석인원,인기프로그램\n";
  const rows = data
    .map(
      (r) =>
        [
          r.year,
          r.month,
          r.center,
          r.visitCount,
          r.uniqueVisitorCount,
          r.avgVisitsPerVisitor != null ? r.avgVisitsPerVisitor.toFixed(1) : "",
          r.avgDailyVisitCount != null ? r.avgDailyVisitCount.toFixed(1) : "",
          r.avgStayMinutes != null ? Math.round(r.avgStayMinutes) : "",
          r.longStayCount,
          r.educationAttendanceCount,
          r.topProgramName ?? "",
        ].join(",")
    )
    .join("\n");

  return new Response("﻿" + header + rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly_summary_${year}.csv"`,
    },
  });
}
