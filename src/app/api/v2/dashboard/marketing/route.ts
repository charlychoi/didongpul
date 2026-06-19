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
      marketing: result.data.marketing,
      charts: {
        websiteDaily: result.data.charts.websiteDaily,
        websiteSources: result.data.charts.websiteSources,
        inflowDistribution: result.data.charts.inflowDistribution,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
