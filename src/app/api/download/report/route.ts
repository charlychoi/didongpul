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
    session.centerScope !== "ALL"
      ? session.centerScope
      : centerFilter !== "ALL"
      ? centerFilter
      : null;

  const periodLabel = month ? `${year}년 ${month}월` : `${year}년 전체`;

  // ── 1. 월별 센터 요약
  const monthly = await prisma.monthlyCenterSummary.findMany({
    where: {
      year,
      ...(month ? { month } : {}),
      ...(centerScope ? { center: centerScope } : {}),
    },
    orderBy: [{ center: "asc" }, { month: "asc" }],
  });

  const dateRange = {
    gte: new Date(year, month ? month - 1 : 0, 1),
    lt: month ? new Date(year, month, 1) : new Date(year + 1, 0, 1),
  };

  // ── 2. 프로그램 이용
  const programs = await prisma.educationAttendance.findMany({
    where: {
      sheetName: { contains: "체험" },
      educationDate: dateRange,
      ...(centerScope ? { center: centerScope } : {}),
    },
    select: { center: true, programName: true, educationDate: true },
  });

  // ── 3. 설문조사
  const surveys = await prisma.surveyResponse.findMany({
    where: {
      responseDate: dateRange,
      ...(centerScope ? { center: centerScope } : {}),
    },
    select: {
      center: true,
      responseDate: true,
      gender: true,
      ageGroup: true,
      programSatisfaction: true,
      operationSatisfaction: true,
      digitalHelpSatisfaction: true,
      howFound: true,
      willReturn: true,
    },
  });

  // ── 4. 데이터 품질 요약
  const qualityLogs = await prisma.dataQualityLog.groupBy({
    by: ["severity", "issueType"],
    _count: { id: true },
  });

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: 종합 요약
  const totalVisits = monthly.reduce((s, r) => s + r.visitCount, 0);
  const totalUnique = monthly.reduce((s, r) => s + r.uniqueVisitorCount, 0);
  const totalEdu = monthly.reduce((s, r) => s + r.educationAttendanceCount, 0);
  const validStay = monthly.filter((r) => r.avgStayMinutes);
  const avgStay =
    validStay.length > 0
      ? validStay.reduce((s, r) => s + (r.avgStayMinutes ?? 0), 0) / validStay.length
      : null;

  const summaryData = [
    ["항목", "값"],
    ["기간", periodLabel],
    ["조회 센터", centerScope ?? "전체"],
    ["총 방문건수", totalVisits],
    ["고유 방문자 수", totalUnique],
    ["1인당 평균 방문", totalUnique > 0 ? +(totalVisits / totalUnique).toFixed(2) : "-"],
    ["평균 체류시간(분)", avgStay ? +avgStay.toFixed(1) : "-"],
    ["교육 참석 인원", totalEdu],
    ["프로그램 이용 건수", programs.length],
    ["설문 응답 건수", surveys.length],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1["!cols"] = [{ wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, "종합요약");

  // ── Sheet 2: 센터별 월별 방문 현황
  const monthlyRows = [
    ["센터", "연도", "월", "방문건수", "고유방문자", "평균체류(분)", "장시간체류", "교육참석"],
    ...monthly.map((r) => [
      r.center,
      r.year,
      r.month,
      r.visitCount,
      r.uniqueVisitorCount,
      r.avgStayMinutes ? +r.avgStayMinutes.toFixed(1) : "",
      r.longStayCount,
      r.educationAttendanceCount,
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(monthlyRows);
  ws2["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, "센터별 월별 방문");

  // ── Sheet 3: 프로그램 이용내역
  const programCount: Record<string, number> = {};
  for (const p of programs) {
    const key = p.programName ?? "미분류";
    programCount[key] = (programCount[key] ?? 0) + 1;
  }
  const programRows = [
    ["프로그램명", "이용건수"],
    ...Object.entries(programCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, cnt]) => [name, cnt]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(programRows);
  ws3["!cols"] = [{ wch: 40 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws3, "프로그램 이용");

  // ── Sheet 4: 설문조사 요약
  const satisfactionScore = (val: string | null) => {
    const map: Record<string, number> = {
      "매우 만족": 5, "만족": 4, "보통": 3, "불만족": 2, "매우 불만족": 1,
    };
    return val ? (map[val] ?? null) : null;
  };
  const scores = surveys
    .map((s) => satisfactionScore(s.programSatisfaction))
    .filter((v): v is number => v !== null);
  const opScores = surveys
    .map((s) => satisfactionScore(s.operationSatisfaction))
    .filter((v): v is number => v !== null);
  const devScores = surveys
    .map((s) => satisfactionScore(s.digitalHelpSatisfaction))
    .filter((v): v is number => v !== null);

  const avgScore = (arr: number[]) =>
    arr.length > 0 ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "-";

  const willReturnYes = surveys.filter((s) => s.willReturn?.includes("예")).length;

  const surveyData = [
    ["항목", "값"],
    ["총 응답 건수", surveys.length],
    ["프로그램 만족도 평균(5점)", avgScore(scores)],
    ["운영 만족도 평균(5점)", avgScore(opScores)],
    ["디지털기기 도움 만족도 평균(5점)", avgScore(devScores)],
    ["재방문 의향(예)", `${willReturnYes}명 (${surveys.length > 0 ? ((willReturnYes / surveys.length) * 100).toFixed(1) : 0}%)`],
  ];

  const genderCount: Record<string, number> = {};
  const ageCount: Record<string, number> = {};
  for (const s of surveys) {
    if (s.gender) genderCount[s.gender] = (genderCount[s.gender] ?? 0) + 1;
    if (s.ageGroup) ageCount[s.ageGroup] = (ageCount[s.ageGroup] ?? 0) + 1;
  }
  surveyData.push(["", ""]);
  surveyData.push(["[성별 분포]", ""]);
  for (const [k, v] of Object.entries(genderCount)) surveyData.push([k, v]);
  surveyData.push(["", ""]);
  surveyData.push(["[연령대 분포]", ""]);
  for (const [k, v] of Object.entries(ageCount).sort()) surveyData.push([k, v]);

  const ws4 = XLSX.utils.aoa_to_sheet(surveyData);
  ws4["!cols"] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws4, "설문조사 요약");

  // ── Sheet 5: 데이터 품질
  const qualityRows = [
    ["심각도", "이슈 유형", "건수"],
    ...qualityLogs
      .sort((a, b) => b._count.id - a._count.id)
      .map((q) => [q.severity, q.issueType, q._count.id]),
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(qualityRows);
  ws5["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws5, "데이터 품질");

  // ── Buffer 반환
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="SSW_report_${year}${month ? `_${String(month).padStart(2, "0")}` : ""}.xlsx"`,
    },
  });
}
