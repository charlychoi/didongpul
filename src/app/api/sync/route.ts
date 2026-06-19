import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { syncAllCenters } from "@/lib/api-sync-service";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fromDate: string | undefined = body.fromDate;
  const toDate: string | undefined = body.toDate;

  try {
    const result = await syncAllCenters(fromDate, toDate);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
