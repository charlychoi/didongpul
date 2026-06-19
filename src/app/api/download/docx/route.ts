import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, PageBreak,
} from "docx";

export const maxDuration = 60;

// 만족도 점수 변환
function satisfactionScore(val: string | null): number | null {
  const map: Record<string, number> = { "매우 만족": 5, "만족": 4, "보통": 3, "불만족": 2, "매우 불만족": 1 };
  return val ? (map[val] ?? null) : null;
}
function avgScore(vals: (number | null)[]): string {
  const nums = vals.filter((v): v is number => v !== null);
  return nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "-";
}

function makeTable(rows: string[][], headerRow = true): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, ri) =>
      new TableRow({
        children: cells.map((text) =>
          new TableCell({
            shading: ri === 0 && headerRow ? { type: ShadingType.SOLID, color: "1E3A5F", fill: "1E3A5F" } : undefined,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            },
            children: [new Paragraph({
              children: [new TextRun({
                text, size: 18,
                bold: ri === 0 && headerRow,
                color: ri === 0 && headerRow ? "FFFFFF" : "333333",
              })],
            })],
          })
        ),
      })
    ),
  });
}

function h1(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1E3A5F" } },
    children: [new TextRun({ text, bold: true, size: 32, color: "1E3A5F" })],
  });
}
function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, size: 26, color: "2563EB" })],
  });
}
function body(text: string, spacing = 0) {
  return new Paragraph({
    spacing: { before: spacing, after: spacing },
    children: [new TextRun({ text, size: 20, color: "444444" })],
  });
}
function empty() {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
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
  const centerScope =
    session.centerScope !== "ALL" ? session.centerScope : centerFilter !== "ALL" ? centerFilter : null;

  const dateRange = {
    gte: new Date(year, month ? month - 1 : 0, 1),
    lt: month ? new Date(year, month, 1) : new Date(year + 1, 0, 1),
  };

  const [monthly, surveys, programs, qualityLogs, actualRange] = await Promise.all([
    prisma.monthlyCenterSummary.findMany({
      where: { year, ...(month ? { month } : {}), ...(centerScope ? { center: centerScope } : {}) },
      orderBy: [{ center: "asc" }, { month: "asc" }],
    }),
    prisma.surveyResponse.findMany({
      where: { responseDate: dateRange, ...(centerScope ? { center: centerScope } : {}) },
      select: {
        center: true, gender: true, ageGroup: true,
        programSatisfaction: true, operationSatisfaction: true, digitalHelpSatisfaction: true,
        willReturn: true, howFound: true,
      },
    }),
    prisma.educationAttendance.findMany({
      where: { educationDate: dateRange, ...(centerScope ? { center: centerScope } : {}) },
      select: { center: true, programName: true },
    }),
    prisma.dataQualityLog.groupBy({
      by: ["severity"],
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

  // KPI 집계
  const totalVisits = monthly.reduce((s, r) => s + r.visitCount, 0);
  const totalUnique = monthly.reduce((s, r) => s + r.uniqueVisitorCount, 0);
  const totalEdu = monthly.reduce((s, r) => s + r.educationAttendanceCount, 0);
  const totalLongStay = monthly.reduce((s, r) => s + r.longStayCount, 0);
  const validStay = monthly.filter((r) => r.avgStayMinutes);
  const avgStayMin = validStay.length > 0
    ? validStay.reduce((s, r) => s + (r.avgStayMinutes ?? 0), 0) / validStay.length : null;
  const avgStayStr = avgStayMin
    ? `${Math.floor(avgStayMin / 60)}시간 ${Math.round(avgStayMin % 60)}분` : "-";

  const byCenterVisits: Record<string, number> = {};
  for (const r of monthly) byCenterVisits[r.center] = (byCenterVisits[r.center] ?? 0) + r.visitCount;

  const pgScores = surveys.map(s => satisfactionScore(s.programSatisfaction));
  const opScores = surveys.map(s => satisfactionScore(s.operationSatisfaction));
  const devScores = surveys.map(s => satisfactionScore(s.digitalHelpSatisfaction));

  const genderCount: Record<string, number> = {};
  const ageCount: Record<string, number> = {};
  for (const s of surveys) {
    if (s.gender) genderCount[s.gender] = (genderCount[s.gender] ?? 0) + 1;
    if (s.ageGroup) { const k = String(s.ageGroup) + "대"; ageCount[k] = (ageCount[k] ?? 0) + 1; }
  }
  const topGender = Object.entries(genderCount).sort((a, b) => b[1] - a[1])[0];
  const topAge = Object.entries(ageCount).sort((a, b) => b[1] - a[1])[0];
  const topCenter = Object.entries(byCenterVisits).sort((a, b) => b[1] - a[1])[0];
  const programCount = new Set(programs.map(p => p.programName)).size;
  const criticalCount = qualityLogs.find(q => q.severity === "critical")?._count.id ?? 0;
  const warningCount = qualityLogs.find(q => q.severity === "warning")?._count.id ?? 0;
  const willReturnYes = surveys.filter(s => s.willReturn?.includes("예")).length;

  // ── AI 보고서 텍스트 생성
  let aiSummary = "";
  let aiAnalysis = "";
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const dataContext = `
분석 기간: ${actualPeriod}
센터: ${centerScope ?? "강동·도봉·동대문 전체"}

[방문 현황]
- 총 방문건수: ${totalVisits.toLocaleString()}건
- 고유 방문자: ${totalUnique.toLocaleString()}명
- 1인당 평균 방문: ${totalUnique > 0 ? (totalVisits / totalUnique).toFixed(1) : "-"}회
- 평균 체류시간: ${avgStayStr}
- 장시간 체류(4시간 이상): ${totalLongStay.toLocaleString()}건
- 방문 최다 센터: ${topCenter?.[0] ?? "-"} (${topCenter?.[1].toLocaleString() ?? "-"}건)

[센터별 방문]
${Object.entries(byCenterVisits).map(([c, v]) => `- ${c}: ${v.toLocaleString()}건`).join("\n")}

[교육 프로그램]
- 교육 참석 건수: ${totalEdu.toLocaleString()}건
- 프로그램 종류: ${programCount}종

[설문 결과]
- 응답 건수: ${surveys.length}건
- 프로그램 만족도: ${avgScore(pgScores)}/5.0
- 운영 만족도: ${avgScore(opScores)}/5.0
- 디지털기기 도움 만족도: ${avgScore(devScores)}/5.0
- 재방문 의향(예): ${willReturnYes}명 (${surveys.length > 0 ? ((willReturnYes / surveys.length) * 100).toFixed(1) : 0}%)
- 주요 성별: ${topGender ? `${topGender[0]} (${topGender[1]}명)` : "-"}
- 주요 연령대: ${topAge ? `${topAge[0]} (${topAge[1]}명)` : "-"}

[데이터 품질]
- 심각 오류: ${criticalCount}건
- 경고: ${warningCount}건
`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `당신은 서울디지털동행플라자 운영 데이터를 분석하는 전문 보고서 작성자입니다.
아래 통계 데이터를 바탕으로 공공기관 보고서 형식의 한국어 분석문을 작성해주세요.

요구사항:
1. [종합 요약] 섹션: 3~4문장으로 핵심 성과와 특이사항 요약
2. [주요 분석] 섹션: 방문 패턴, 이용자 특성, 만족도, 개선 시사점 각각 2~3문장씩

어조: 공공기관 보고서 스타일 (격식체, ~임, ~됨 형식)
데이터 출처: 서울디지털동행플라자 관리 시스템

데이터:
${dataContext}`,
        },
      ],
    });

    const fullText = msg.content[0].type === "text" ? msg.content[0].text : "";
    const summaryMatch = fullText.match(/\[종합 요약\]([\s\S]*?)(?=\[주요 분석\]|$)/);
    const analysisMatch = fullText.match(/\[주요 분석\]([\s\S]*?)$/);
    aiSummary = summaryMatch?.[1]?.trim() ?? fullText.slice(0, 400).trim();
    aiAnalysis = analysisMatch?.[1]?.trim() ?? "";
  } catch {
    aiSummary = `분석 기간(${actualPeriod}) 동안 서울디지털동행플라자 3개 센터(강동·도봉·동대문)에서 총 ${totalVisits.toLocaleString()}건의 방문이 기록되었음. 고유 방문자 ${totalUnique.toLocaleString()}명이 평균 ${avgStayStr}을 체류하였으며, 설문 응답자 ${surveys.length}명의 프로그램 만족도는 ${avgScore(pgScores)}/5.0점으로 집계됨.`;
    aiAnalysis = "";
  }

  // ── DOCX 문서 조립
  const centerRows = [
    ["센터", "방문건수", "고유방문자", "1인당방문", "교육참석"],
    ...Object.entries(byCenterVisits).map(([center, visits]) => {
      const m = monthly.filter(r => r.center === center);
      const unique = m.reduce((s, r) => s + r.uniqueVisitorCount, 0);
      const edu = m.reduce((s, r) => s + r.educationAttendanceCount, 0);
      return [
        center,
        visits.toLocaleString() + "건",
        unique.toLocaleString() + "명",
        unique > 0 ? (visits / unique).toFixed(1) + "회" : "-",
        edu.toLocaleString() + "건",
      ];
    }),
    ["합계",
      totalVisits.toLocaleString() + "건",
      totalUnique.toLocaleString() + "명",
      totalUnique > 0 ? (totalVisits / totalUnique).toFixed(1) + "회" : "-",
      totalEdu.toLocaleString() + "건",
    ],
  ];

  const monthlyRows = [
    ["센터", "년월", "방문건수", "고유방문자", "평균체류"],
    ...monthly.map(r => [
      r.center,
      `${r.year}년 ${r.month}월`,
      r.visitCount.toLocaleString() + "건",
      r.uniqueVisitorCount.toLocaleString() + "명",
      r.avgStayMinutes ? `${Math.floor(r.avgStayMinutes / 60)}시간 ${Math.round(r.avgStayMinutes % 60)}분` : "-",
    ]),
  ];

  const surveyTableRows = [
    ["항목", "결과"],
    ["총 응답 건수", surveys.length.toLocaleString() + "건"],
    ["주요 이용자 성별", topGender ? `${topGender[0]} (${((topGender[1] / surveys.length) * 100).toFixed(0)}%)` : "-"],
    ["주요 이용자 연령대", topAge ? `${topAge[0]} (${((topAge[1] / surveys.length) * 100).toFixed(0)}%)` : "-"],
    ["프로그램 만족도", avgScore(pgScores) + " / 5.0"],
    ["운영 만족도", avgScore(opScores) + " / 5.0"],
    ["디지털기기 도움 만족도", avgScore(devScores) + " / 5.0"],
    ["재방문 의향 (예)", `${willReturnYes}명 (${surveys.length > 0 ? ((willReturnYes / surveys.length) * 100).toFixed(1) : 0}%)`],
  ];

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "맑은 고딕", size: 20 } },
      },
    },
    sections: [{
      children: [
        // ── 표지
        empty(), empty(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 400 },
          children: [new TextRun({ text: "서울디지털동행플라자", bold: true, size: 36, color: "1E3A5F" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: "운영 현황 종합 보고서", bold: true, size: 48, color: "1E3A5F" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 600 },
          children: [new TextRun({ text: `분석 기간: ${actualPeriod}`, size: 24, color: "666666" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: `센터: ${centerScope ?? "강동·도봉·동대문 전체"}`, size: 22, color: "666666" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: `생성일: ${new Date().toLocaleDateString("ko-KR")}`, size: 22, color: "888888" })],
        }),

        // ── 1. 종합 요약 (AI)
        new Paragraph({ children: [new PageBreak()] }),
        h1("1. 종합 요약"),
        ...aiSummary.split("\n").filter(l => l.trim()).map(l => body(l.trim(), 80)),
        empty(),

        // ── 2. 핵심 지표
        h1("2. 핵심 방문 지표"),
        makeTable([
          ["지표", "값", "비고"],
          ["총 방문건수", totalVisits.toLocaleString() + "건", "전체 입장 기록"],
          ["고유 방문자", totalUnique.toLocaleString() + "명", "연락처 기준"],
          ["1인당 평균 방문", totalUnique > 0 ? (totalVisits / totalUnique).toFixed(1) + "회" : "-", ""],
          ["평균 체류시간", avgStayStr, "입퇴장 기록 기준"],
          ["장시간 체류 (4h+)", totalLongStay.toLocaleString() + "건", "데이터 확인 필요"],
          ["교육 참석 건수", totalEdu.toLocaleString() + "건", "프로그램 예약 완료 기준"],
        ]),
        empty(),

        // ── 3. 센터별 현황
        h1("3. 센터별 방문 현황"),
        makeTable(centerRows),
        empty(),

        // ── 4. 월별 추이
        h1("4. 월별 방문 추이"),
        makeTable(monthlyRows),
        empty(),

        // ── 5. 설문 결과
        h1("5. 이용자 만족도 (설문)"),
        makeTable(surveyTableRows),
        empty(),

        // ── 6. 주요 분석 (AI)
        ...(aiAnalysis ? [
          h1("6. 운영 분석 및 시사점"),
          ...aiAnalysis.split("\n").filter(l => l.trim()).map(l => body(l.trim(), 80)),
          empty(),
        ] : []),

        // ── 7. 데이터 품질
        h1("7. 데이터 품질"),
        makeTable([
          ["심각도", "건수", "조치"],
          ["심각 오류", criticalCount + "건", criticalCount > 0 ? "즉시 확인 필요" : "양호"],
          ["경고", warningCount + "건", warningCount > 50 ? "검토 권장" : "양호"],
        ]),
        empty(),
        body("* 본 보고서는 서울디지털동행플라자 관리 시스템에서 자동 생성되었습니다. (AI 보조 분석 포함)", 200),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  const slug = actualPeriod.replace(/\s*~\s*/, "_");

  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="SSW_종합보고서_${slug}.docx"`,
    },
  });
}
