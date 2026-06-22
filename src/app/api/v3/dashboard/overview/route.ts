import { NextRequest } from "next/server";
import { getDashboardV3 } from "@/lib/dashboard-v3/route";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await getDashboardV3(request, { totals: true, visits: true });
  if (result.error) return result.error;
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
