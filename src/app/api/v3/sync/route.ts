import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { syncDashboardV3Range } from "@/lib/dashboard-v3/warehouse";
import { V3_CENTERS, V3CenterFilter } from "@/lib/dashboard-v3/types";

export const maxDuration = 300;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCenter(value: string | null): V3CenterFilter {
  if (!value || value === "ALL") return "ALL";
  const code = Number(value);
  return V3_CENTERS.some((center) => center.code === code) ? (code as V3CenterFilter) : "ALL";
}

async function isAuthorized(request: NextRequest) {
  const syncSecret = process.env.V3_SYNC_SECRET;
  const headerSecret = request.headers.get("x-v3-sync-secret");
  if (syncSecret && headerSecret === syncSecret) return true;

  const session = await getSession();
  return session.isLoggedIn;
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const startDate = typeof body.start_date === "string" ? body.start_date : todayString();
  const endDate = typeof body.end_date === "string" ? body.end_date : startDate;
  const center = normalizeCenter(typeof body.center === "string" ? body.center : null);

  const result = await syncDashboardV3Range({
    startDate,
    endDate,
    center,
    triggeredBy: "api",
  });

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
