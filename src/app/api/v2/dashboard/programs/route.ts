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
        programApplications: result.data.charts.programApplications,
        programCompletions: result.data.charts.programCompletions,
        programWaiting: result.data.charts.programWaiting,
        programAverageOrder: result.data.charts.programAverageOrder,
        programLikes: result.data.charts.programLikes,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
