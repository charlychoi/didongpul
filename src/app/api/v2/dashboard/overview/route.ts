import { NextRequest } from "next/server";
import { getDashboardV2 } from "@/lib/dashboard-v2/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV2(request, { totals: true, cumulativeTotals: true, visits: true });
  if (result.error) return result.error;
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
