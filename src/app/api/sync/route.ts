import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { syncAllCenters, syncCenter } from "@/lib/api-sync-service";
import type { CenterCode } from "@/lib/didong-api";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fromDate: string | undefined = body.fromDate;
  const toDate: string | undefined = body.toDate;
  // center 지정 시 해당 센터만 동기화 (긴 기간 분할 처리용)
  const centerCode: number | undefined = body.centerCode ? Number(body.centerCode) : undefined;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); })();
    const result = centerCode
      ? await syncCenter(centerCode as CenterCode, fromDate ?? thirtyDaysAgo, toDate ?? today)
      : await syncAllCenters(fromDate, toDate);
    if ("error" in result && result.error) {
      return Response.json({ ok: false, error: result.error, result }, { status: 500 });
    }
    if ("results" in result) {
      const failed = result.results.find((item) => item.error);
      if (failed?.error) {
        return Response.json({ ok: false, error: failed.error, result }, { status: 500 });
      }
    }
    return Response.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
