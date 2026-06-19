import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as XLSX from "xlsx";

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

  const dateRange = {
    gte: new Date(year, month ? month - 1 : 0, 1),
    lt: month ? new Date(year, month, 1) : new Date(year + 1, 0, 1),
  };

  const [monthly, daily, programs, surveys, waitings, qualityLogs, actualRange] = await Promise.all([
    prisma.monthlyCenterSummary.findMany({
      where: { year, ...(month ? { month } : {}), ...(centerScope ? { center: centerScope } : {}) },
      orderBy: [{ center: "asc" }, { month: "asc" }],
    }),
    prisma.dailyCenterSummary.findMany({
      where: { date: dateRange, ...(centerScope ? { center: centerScope } : {}) },
      orderBy: [{ date: "asc" }, { center: "asc" }],
    }),
    prisma.educationAttendance.findMany({
      where: { educationDate: dateRange, ...(centerScope ? { center: centerScope } : {}) },
      select: { center: true, programName: true, educationDate: true, attendanceStatus: true },
    }),
    prisma.surveyResponse.findMany({
      where: { responseDate: dateRange, ...(centerScope ? { center: centerScope } : {}) },
      select: {
        center: true, responseDate: true, gender: true, ageGroup: true,
        howFound: true, visitCount: true, participatedPrograms: true,
        programSatisfaction: true, operationSatisfaction: true, digitalHelpSatisfaction: true,
        willReturn: true, residence: true,
      },
    }),
    prisma.educationAttendance.findMany({
      where: { educationDate: dateRange, ...(centerScope ? { center: centerScope } : {}) },
      select: { center: true, programName: true, educationDate: true, attendanceStatus: true },
    }),
    prisma.dataQualityLog.groupBy({
      by: ["severity", "issueType"],
      _count: { id: true },
    }),
    prisma.cleanVisitLog.aggregate({
      where: { year, ...(month ? { month } : {}), ...(centerScope ? { center: centerScope } : {}) },
      _min: { visitDate: true },
      _max: { visitDate: true },
    }),
  ]);

  const minDate = actualRange._min.visitDate?.toISOString().slice(0, 10) ?? "-";
  const maxDate = actualRange._max.visitDate?.toISOString().slice(0, 10) ?? "-";
  const actualPeriod = `${minDate} ~ ${maxDate}`;
  const filterPeriod = month ? `${year}년 ${month}월` : `${year}년 전체`;
  const centerLabel = centerScope ?? "전체 센터";

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: 종합 요약
  const totalVisits = monthly.reduce((s, r) => s + r.visitCount, 0);
  const totalUnique = monthly.reduce((s, r) => s + r.uniqueVisitorCount, 0);
  const totalEdu = monthly.reduce((s, r) => s + r.educationAttendanceCount, 0);
  const totalLongStay = monthly.reduce((s, r) => s + r.longStayCount, 0);
  const validStay = monthly.filter((r) => r.avgStayMinutes);
  const avgStay = validStay.length > 0
    ? validStay.reduce((s, r) => s + (r.avgStayMinutes ?? 0), 0) / validStay.length : null;

  const satisfactionScore = (val: string | null) => {
    const map: Record<string, number> = { "매우 만족": 5, "만족": 4, "보통": 3, "불만족": 2, "매우 불만족": 1 };
    return val ? (map[val] ?? null) : null;
  };
  const avgScore = (arr: number[]) =>
    arr.length > 0 ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
  const pgScores = surveys.map(s => satisfactionScore(s.programSatisfaction)).filter((v): v is number => v !== null);
  const opScores = surveys.map(s => satisfactionScore(s.operationSatisfaction)).filter((v): v is number => v !== null);
  const devScores = surveys.map(s => satisfactionScore(s.digitalHelpSatisfaction)).filter((v): v is number => v !== null);

  const ws1Data = [
    ["서울디지털동행플라자 통계 데이터"],
    [],
    ["조회 조건", ""],
    ["조회 기간 (필터)", filterPeriod],
    ["실제 데이터 기간", actualPeriod],
    ["센터", centerLabel],
    ["생성일", new Date().toLocaleString("ko-KR")],
    [],
    ["═══ 방문 핵심 지표 ═══", ""],
    ["총 방문건수", totalVisits],
    ["고유 방문자 수", totalUnique],
    ["1인당 평균 방문 횟수", totalUnique > 0 ? +(totalVisits / totalUnique).toFixed(2) : "-"],
    ["평균 체류시간 (분)", avgStay ? +avgStay.toFixed(1) : "-"],
    ["장시간 체류 건수 (4시간 이상)", totalLongStay],
    [],
    ["═══ 교육 지표 ═══", ""],
    ["교육 참석 건수 (API 동기화)", totalEdu],
    ["등록된 프로그램 수", new Set(programs.map(p => p.programName)).size],
    [],
    ["═══ 설문 지표 ═══", ""],
    ["설문 응답 건수", surveys.length],
    ["프로그램 만족도 평균 (5점)", avgScore(pgScores) ?? "-"],
    ["운영 만족도 평균 (5점)", avgScore(opScores) ?? "-"],
    ["디지털 도움 만족도 평균 (5점)", avgScore(devScores) ?? "-"],
    ["재방문 의향 (예)", surveys.filter(s => s.willReturn?.includes("예")).length],
    [],
    ["═══ 데이터 품질 ═══", ""],
    ["심각 오류 건수", qualityLogs.filter(q => q.severity === "critical").reduce((s, q) => s + q._count.id, 0)],
    ["경고 건수", qualityLogs.filter(q => q.severity === "warning").reduce((s, q) => s + q._count.id, 0)],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  ws1["!cols"] = [{ wch: 28 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, "종합요약");

  // ── Sheet 2: 센터별 월별 방문 현황
  const ws2 = XLSX.utils.aoa_to_sheet([
    [`분석 기간: ${actualPeriod}`, "", "", "", "", "", "", ""],
    ["센터", "연도", "월", "방문건수", "고유방문자", "1인당방문", "평균체류(분)", "장시간체류", "교육참석"],
    ...monthly.map((r) => [
      r.center, r.year, r.month, r.visitCount, r.uniqueVisitorCount,
      r.uniqueVisitorCount > 0 ? +(r.visitCount / r.uniqueVisitorCount).toFixed(2) : "",
      r.avgStayMinutes ? +r.avgStayMinutes.toFixed(1) : "",
      r.longStayCount, r.educationAttendanceCount,
    ]),
  ]);
  ws2["!cols"] = [{ wch: 12 }, { wch: 6 }, { wch: 4 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, "센터별 월별 방문");

  // ── Sheet 3: 일별 방문 추이
  const ws3 = XLSX.utils.aoa_to_sheet([
    [`분석 기간: ${actualPeriod}`, "", "", ""],
    ["날짜", "센터", "방문건수", "고유방문자", "평균체류(분)"],
    ...daily.map((d) => [
      d.date.toISOString().slice(0, 10), d.center,
      d.visitCount, d.uniqueVisitorCount,
      d.avgStayMinutes ? +d.avgStayMinutes.toFixed(1) : "",
    ]),
  ]);
  ws3["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws3, "일별 방문 추이");

  // ── Sheet 4: 프로그램 이용내역
  const programCount: Record<string, { total: number; centers: Set<string> }> = {};
  for (const p of programs) {
    const key = p.programName ?? "미분류";
    if (!programCount[key]) programCount[key] = { total: 0, centers: new Set() };
    programCount[key].total += 1;
    if (p.center) programCount[key].centers.add(p.center);
  }
  const ws4 = XLSX.utils.aoa_to_sheet([
    [`분석 기간: ${actualPeriod}`, "", ""],
    ["프로그램명", "이용건수", "운영 센터"],
    ...Object.entries(programCount)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, v]) => [name, v.total, [...v.centers].join(", ")]),
  ]);
  ws4["!cols"] = [{ wch: 40 }, { wch: 10 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws4, "프로그램 이용내역");

  // ── Sheet 5: 설문조사 상세
  const genderCount: Record<string, number> = {};
  const ageCount: Record<string, number> = {};
  const howFoundCount: Record<string, number> = {};
  const willReturnCount: Record<string, number> = {};
  for (const s of surveys) {
    if (s.gender) genderCount[s.gender] = (genderCount[s.gender] ?? 0) + 1;
    if (s.ageGroup) { const k = String(s.ageGroup) + "대"; ageCount[k] = (ageCount[k] ?? 0) + 1; }
    if (s.howFound) howFoundCount[s.howFound] = (howFoundCount[s.howFound] ?? 0) + 1;
    if (s.willReturn) willReturnCount[s.willReturn] = (willReturnCount[s.willReturn] ?? 0) + 1;
  }

  const surveyRows: (string | number)[][] = [
    [`분석 기간: ${actualPeriod}`, ""],
    [],
    ["항목", "값"],
    ["총 응답 건수", surveys.length],
    ["프로그램 만족도 평균 (5점)", avgScore(pgScores) ?? "-"],
    ["운영 만족도 평균 (5점)", avgScore(opScores) ?? "-"],
    ["디지털기기 도움 만족도 평균 (5점)", avgScore(devScores) ?? "-"],
    ["재방문 의향 (예)", surveys.filter(s => s.willReturn?.includes("예")).length],
    [],
    ["[성별 분포]", ""],
    ...Object.entries(genderCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
    [],
    ["[연령대 분포]", ""],
    ...Object.entries(ageCount).sort().map(([k, v]) => [k, v]),
    [],
    ["[방문 경로]", ""],
    ...Object.entries(howFoundCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
    [],
    ["[재방문 의향]", ""],
    ...Object.entries(willReturnCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(surveyRows);
  ws5["!cols"] = [{ wch: 32 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws5, "설문조사 분석");

  // ── Sheet 6: 데이터 품질
  const ws6 = XLSX.utils.aoa_to_sheet([
    ["심각도", "이슈 유형", "건수"],
    ...qualityLogs
      .sort((a, b) => b._count.id - a._count.id)
      .map((q) => [q.severity, q.issueType, q._count.id]),
  ]);
  ws6["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws6, "데이터 품질");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const slug = actualPeriod.replace(/\s*~\s*/, "_");

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="SSW_통계데이터_${slug}.xlsx"`,
    },
  });
}
