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
  const center = searchParams.get("center");

  const where: Prisma.CleanVisitLogWhereInput = {
    year,
    ...(month ? { month } : {}),
    ...(center && center !== "ALL" ? { center } : {}),
    ...(session.centerScope !== "ALL" ? { center: session.centerScope } : {}),
  };

  const logs = await prisma.cleanVisitLog.findMany({
    where,
    select: {
      center: true,
      visitorNameMasked: true,
      visitDate: true,
      entryHour: true,
      exitHour: true,
      stayMinutes: true,
      year: true,
      month: true,
      weekday: true,
      isLongStay: true,
    },
    orderBy: { visitDate: "asc" },
  });

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const header = "센터,방문자(마스킹),방문일자,입장시간,퇴장시간,체류시간(분),연도,월,요일,장시간여부\n";
  const rows = logs
    .map(
      (l) =>
        [
          l.center,
          l.visitorNameMasked ?? "",
          l.visitDate?.toISOString().slice(0, 10) ?? "",
          l.entryHour ?? "",
          l.exitHour ?? "",
          l.stayMinutes != null ? Math.round(l.stayMinutes) : "",
          l.year ?? "",
          l.month ?? "",
          l.weekday != null ? WEEKDAYS[l.weekday] : "",
          l.isLongStay ? "Y" : "N",
        ].join(",")
    )
    .join("\n");

  const csv = "﻿" + header + rows; // BOM for Excel Korean compatibility

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="visits_${year}${month ? String(month).padStart(2, "0") : "all"}.csv"`,
    },
  });
}
