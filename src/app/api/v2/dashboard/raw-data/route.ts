import { NextRequest } from "next/server";
import { getDashboardV2 } from "@/lib/dashboard-v2/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV2(request, {
    visits: true,
    waitings: true,
    surveys: true,
    coupons: true,
    exactTotals: false,
  });
  if (result.error) return result.error;
  return Response.json(
    {
      period: result.data.period,
      filters: result.data.filters,
      sync: result.data.sync,
      rawData: result.data.rawData,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
