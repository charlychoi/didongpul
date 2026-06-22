import { NextRequest } from "next/server";
import { getDashboardV3 } from "@/lib/dashboard-v3/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV3(request, { waitings: true, surveys: true });
  if (result.error) return result.error;
  return Response.json(
    {
      period: result.data.period,
      filters: result.data.filters,
      sync: result.data.sync,
      kpis: result.data.kpis,
      programs: result.data.programs,
      charts: {
        programApplications: result.data.charts.programApplications,
        programCompletions: result.data.charts.programCompletions,
        programWaiting: result.data.charts.programWaiting,
        programAverageOrder: result.data.charts.programAverageOrder,
        programLikes: result.data.charts.programLikes,
        programByCenter: result.data.charts.programByCenter,
        programByMonth: result.data.charts.programByMonth,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
