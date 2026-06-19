import { NextRequest } from "next/server";
import { getDashboardV2 } from "@/lib/dashboard-v2/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV2(request);
  if (result.error) return result.error;
  return Response.json(
    {
      period: result.data.period,
      filters: result.data.filters,
      sync: result.data.sync,
      kpis: result.data.kpis,
      charts: {
        ageDistribution: result.data.charts.ageDistribution,
        genderDistribution: result.data.charts.genderDistribution,
        locationDistribution: result.data.charts.locationDistribution,
        visitCountDistribution: result.data.charts.visitCountDistribution,
        centerAgeHeatmap: result.data.charts.centerAgeHeatmap,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
