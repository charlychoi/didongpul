import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/session";
import { satisfactionToScore } from "@/features/upload/ingestSurveyData";

function mergeCounts<T extends string>(
  primary: { key: T | null; count: number }[],
  secondary: { key: T | null; count: number }[],
  limit?: number
) {
  const totals = new Map<T, number>();
  for (const item of [...primary, ...secondary]) {
    if (!item.key) continue;
    totals.set(item.key, (totals.get(item.key) ?? 0) + item.count);
  }
  const rows = [...totals.entries()].map(([key, count]) => ({ key, count }));
  rows.sort((a, b) => b.count - a.count);
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

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

  const where: Prisma.SurveyResponseWhereInput = {
    year,
    ...(month ? { month } : {}),
    ...(centerScope ? { center: centerScope } : {}),
  };
  const totalWhere: Prisma.ApiTotalRecordWhereInput = {
    year,
    ...(month ? { month } : {}),
    ...(centerScope ? { center: centerScope } : {}),
  };

  const total = await prisma.surveyResponse.count({ where });

  // 센터별
  const byCenter = await prisma.surveyResponse.groupBy({
    by: ["center"], where: { ...where, center: { not: null } },
    _count: { id: true }, orderBy: { _count: { id: "desc" } },
  });

  // 성별
  const byGender = await prisma.surveyResponse.groupBy({
    by: ["gender"], where: { ...where, gender: { not: null } },
    _count: { id: true }, orderBy: { _count: { id: "desc" } },
  });

  // 연령대
  const byAge = await prisma.surveyResponse.groupBy({
    by: ["ageGroup"], where: { ...where, ageGroup: { not: null } },
    _count: { id: true }, orderBy: { ageGroup: "asc" },
  });

  // 알게된 경로
  const byHowFound = await prisma.surveyResponse.groupBy({
    by: ["howFound"], where: { ...where, howFound: { not: null } },
    _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 10,
  });
  const byTotalWayToCome = await prisma.apiTotalRecord.groupBy({
    by: ["wayToCome"], where: { ...totalWhere, wayToCome: { not: null } },
    _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 10,
  });
  const mergedHowFound = mergeCounts(
    byHowFound.map((r) => ({ key: r.howFound, count: r._count.id })),
    byTotalWayToCome.map((r) => ({ key: r.wayToCome, count: r._count.id })),
    10
  );

  // 방문횟수
  const byVisitCount = await prisma.surveyResponse.groupBy({
    by: ["visitCount"], where: { ...where, visitCount: { not: null } },
    _count: { id: true }, orderBy: { _count: { id: "desc" } },
  });

  // 재방문 의향
  const byWillReturn = await prisma.surveyResponse.groupBy({
    by: ["willReturn"], where: { ...where, willReturn: { not: null } },
    _count: { id: true }, orderBy: { _count: { id: "desc" } },
  });

  // 만족도 평균 점수 계산
  const allResponses = await prisma.surveyResponse.findMany({
    where,
    select: { programSatisfaction: true, operationSatisfaction: true, digitalHelpSatisfaction: true },
  });

  const avgScore = (field: "programSatisfaction" | "operationSatisfaction" | "digitalHelpSatisfaction") => {
    const scores = allResponses.map((r) => satisfactionToScore(r[field])).filter((s): s is number => s !== null);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };

  // 인기 프로그램
  const byFavorite = await prisma.surveyResponse.groupBy({
    by: ["favoriteProgram"], where: { ...where, favoriteProgram: { not: null } },
    _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 10,
  });

  // 월별 응답 추이
  const byMonth = await prisma.surveyResponse.groupBy({
    by: ["year", "month"],
    where: { ...where, year: { not: null }, month: { not: null } },
    _count: { id: true }, orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  return Response.json({
    total,
    byCenter: byCenter.map((r) => ({ center: r.center!, count: r._count.id })),
    byGender: byGender.map((r) => ({ gender: r.gender!, count: r._count.id })),
    byAge: byAge.map((r) => ({ age: `${r.ageGroup}대`, count: r._count.id })),
    byHowFound: mergedHowFound.map((r) => ({ label: r.key, count: r.count })),
    byVisitCount: byVisitCount.map((r) => ({ label: r.visitCount!, count: r._count.id })),
    byWillReturn: byWillReturn.map((r) => ({ label: r.willReturn!, count: r._count.id })),
    byFavorite: byFavorite.map((r) => ({ name: r.favoriteProgram!, count: r._count.id })),
    byMonth: byMonth.map((r) => ({
      month: `${r.year}-${String(r.month).padStart(2, "0")}`,
      count: r._count.id,
    })),
    satisfaction: {
      program: avgScore("programSatisfaction"),
      operation: avgScore("operationSatisfaction"),
      digitalHelp: avgScore("digitalHelpSatisfaction"),
    },
  });
}
