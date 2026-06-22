import { NextRequest } from "next/server";
import { getDashboardV3 } from "@/lib/dashboard-v3/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV3(request, { coupons: true });
  if (result.error) return result.error;
  return Response.json(
    {
      period: result.data.period,
      filters: result.data.filters,
      sync: result.data.sync,
      coupons: result.data.coupons,
      charts: {
        couponStatus: result.data.charts.couponStatus,
        couponByCenter: result.data.charts.couponByCenter,
        couponDaily: result.data.charts.couponDaily,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
