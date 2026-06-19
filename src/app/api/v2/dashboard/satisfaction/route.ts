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
      charts: {
        satisfactionBars: result.data.charts.satisfactionBars,
        satisfactionTrend: result.data.charts.satisfactionTrend,
        inflowDistribution: result.data.charts.inflowDistribution,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
