import { NextRequest } from "next/server";
import { getDashboardV2 } from "@/lib/dashboard-v2/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV2(request, { visits: true, surveys: true });
  if (result.error) return result.error;
  return Response.json(
    {
      period: result.data.period,
      filters: result.data.filters,
      sync: result.data.sync,
      kpis: result.data.kpis,
      centers: result.data.centers,
      survey: result.data.survey,
      charts: {
        satisfactionBars: result.data.charts.satisfactionBars,
        satisfactionTrend: result.data.charts.satisfactionTrend,
        inflowDistribution: result.data.charts.inflowDistribution,
        surveyGenderDistribution: result.data.charts.surveyGenderDistribution,
        surveyAgeDistribution: result.data.charts.surveyAgeDistribution,
        surveyVisitCountDistribution: result.data.charts.surveyVisitCountDistribution,
        surveyWillReturnDistribution: result.data.charts.surveyWillReturnDistribution,
        surveyMonthly: result.data.charts.surveyMonthly,
        programLikes: result.data.charts.programLikes,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
