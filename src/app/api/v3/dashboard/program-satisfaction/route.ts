import { NextRequest } from "next/server";
import { getDashboardV3 } from "@/lib/dashboard-v3/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV3(request, {
    waitings: true,
    surveys: true,
    exactTotals: false,
    pageLimit: 3,
  });
  if (result.error) return result.error;
  return Response.json(
    {
      period: result.data.period,
      filters: result.data.filters,
      sync: result.data.sync,
      kpis: result.data.kpis,
      programs: result.data.programs,
      survey: result.data.survey,
      charts: {
        programSatisfactionRanking: result.data.charts.programSatisfactionRanking,
        programLikes: result.data.charts.programLikes,
        programOpportunity: result.data.charts.programOpportunity,
        programImprovementCandidates: result.data.charts.programImprovementCandidates,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
