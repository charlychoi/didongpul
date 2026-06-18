interface InsightData {
  totalVisits: number;
  totalUnique: number;
  avgStayMinutes: number | null;
  totalLongStay: number;
  totalEduAttendance: number;
  qualityScore: number;
  byCenterVisits?: Record<string, number>;
  peakHour?: number | null;
}

interface Insight {
  text: string;
  type: "info" | "warning" | "positive";
}

export function generateOverviewInsights(data: InsightData): Insight[] {
  const insights: Insight[] = [];

  // Total visits insight
  insights.push({
    text: `이번 기간 총 방문건수는 ${data.totalVisits.toLocaleString()}건입니다.`,
    type: "info",
  });

  // Center with most visits
  if (data.byCenterVisits) {
    const sorted = Object.entries(data.byCenterVisits).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      insights.push({
        text: `방문이 가장 많은 센터는 ${sorted[0][0]}(${sorted[0][1].toLocaleString()}건)입니다.`,
        type: "positive",
      });
    }
  }

  // Unique visitors
  if (data.totalUnique > 0) {
    const freq = data.totalVisits / data.totalUnique;
    insights.push({
      text: `고유 방문자 수는 ${data.totalUnique.toLocaleString()}명이며, 1인당 평균 ${freq.toFixed(1)}회 방문하였습니다.`,
      type: "info",
    });
  }

  // Stay time
  if (data.avgStayMinutes != null) {
    const h = Math.floor(data.avgStayMinutes / 60);
    const m = Math.round(data.avgStayMinutes % 60);
    insights.push({
      text: `평균 체류시간은 ${h > 0 ? h + "시간 " : ""}${m}분입니다.`,
      type: "info",
    });
  }

  // Peak hour
  if (data.peakHour != null) {
    insights.push({
      text: `방문이 가장 집중되는 시간대는 ${data.peakHour}시~${data.peakHour + 1}시입니다.`,
      type: "info",
    });
  }

  // Long stay warning
  if (data.totalLongStay > 0) {
    insights.push({
      text: `장시간 체류(10시간 이상) 기록이 ${data.totalLongStay}건 발견되어 데이터 확인이 필요합니다.`,
      type: "warning",
    });
  }

  // Education
  if (data.totalEduAttendance > 0) {
    insights.push({
      text: `교육 프로그램 참석 인원은 총 ${data.totalEduAttendance.toLocaleString()}명입니다.`,
      type: "positive",
    });
  }

  // Quality score
  if (data.qualityScore < 70) {
    insights.push({
      text: `데이터 품질 점수가 ${data.qualityScore.toFixed(0)}점으로 낮습니다. 데이터 품질 점검 탭을 확인해주세요.`,
      type: "warning",
    });
  } else if (data.qualityScore >= 90) {
    insights.push({
      text: `데이터 품질 점수가 ${data.qualityScore.toFixed(0)}점으로 양호합니다.`,
      type: "positive",
    });
  }

  return insights;
}

export function generateCenterTypeLabel(
  center: string,
  uniqueVisitors: number,
  avgStayMinutes: number | null,
  avgVisitsPerVisitor: number | null,
  avgDailyVisit: number | null
): string {
  if (!avgStayMinutes || !avgVisitsPerVisitor) return "데이터 부족";

  const isHighUnique = uniqueVisitors > 500;
  const isLongStay = avgStayMinutes > 180;
  const isFrequent = avgVisitsPerVisitor > 3;

  if (isHighUnique && !isLongStay) return "신규 유입·고회전형";
  if (isFrequent && isLongStay) return "재방문·장시간 체류형";
  if (!isHighUnique && !isLongStay && !isFrequent) return "홍보 강화 대상";
  return "균형형";
}
