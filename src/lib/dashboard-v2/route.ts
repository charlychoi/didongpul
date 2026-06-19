import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { buildDashboardV2 } from "./aggregator";
import { fetchDashboardV2Sources } from "./api-client";
import { V2_CENTERS, V2CenterFilter, V2Query } from "./types";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoString() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return date.toISOString().slice(0, 10);
}

export function parseV2Query(request: NextRequest): V2Query {
  const { searchParams } = new URL(request.url);
  const centerRaw = searchParams.get("center") ?? "ALL";
  const center = centerRaw === "ALL" ? "ALL" : Number(centerRaw);
  const allowedCenter = V2_CENTERS.some((item) => item.code === center);

  return {
    startDate: searchParams.get("start_date") || sevenDaysAgoString(),
    endDate: searchParams.get("end_date") || todayString(),
    center: (center === "ALL" || allowedCenter ? center : "ALL") as V2CenterFilter,
    bypassCache: searchParams.get("refresh") === "1",
  };
}

export async function getDashboardV2(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return { error: Response.json({ error: "인증이 필요합니다." }, { status: 401 }) };
  }

  const query = parseV2Query(request);
  const source = await fetchDashboardV2Sources(query);
  return { data: buildDashboardV2(query, source) };
}
