import { NextRequest } from "next/server";
import { syncAllCenters } from "@/lib/api-sync-service";

export const maxDuration = 300;

// Vercel Cron은 Authorization 헤더로 CRON_SECRET을 검증
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllCenters();
    console.log("[cron/sync] 완료:", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync] 오류:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
