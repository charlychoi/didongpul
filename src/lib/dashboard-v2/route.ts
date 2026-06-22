import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { buildDashboardV2 } from "./aggregator";
import { DashboardV2SourceOptions, fetchDashboardV2Sources } from "./api-client";
import { getDashboardV2ApiCache, getDashboardV2DatabaseStatus, setDashboardV2ApiCache } from "./db";
import { ApiCollection, V2_CENTERS, V2CenterFilter, V2Query } from "./types";

const DASHBOARD_RESPONSE_TTL_MS = 30 * 60 * 1000;
const DASHBOARD_RESPONSE_CACHE_VERSION = 8;
type DashboardV2Result = ReturnType<typeof buildDashboardV2>;
const pendingDashboardResponses = new Map<string, Promise<DashboardV2Result>>();

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

export async function getDashboardV2(
  request: NextRequest,
  sourceOptions?: DashboardV2SourceOptions
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return { error: Response.json({ error: "인증이 필요합니다." }, { status: 401 }) };
  }

  const query = parseV2Query(request);
  getDashboardV2DatabaseStatus();
  const responseCacheKey = `dashboard-v2-response:${JSON.stringify({
    version: DASHBOARD_RESPONSE_CACHE_VERSION,
    query,
    sourceOptions,
  })}`;
  if (!query.bypassCache) {
    const pending = pendingDashboardResponses.get(responseCacheKey);
    if (pending) return { data: await pending };

    try {
      const cached = await getDashboardV2ApiCache(responseCacheKey);
      if (cached) return { data: cached.value as DashboardV2Result };
    } catch (error) {
      console.warn("dashboard v2 response cache read failed", error);
    }
  }

  const responsePromise = (async () => {
    const source = await fetchDashboardV2Sources(query, sourceOptions);
    const requestedSources: Array<ApiCollection<unknown>> = [];
    const wants = sourceOptions ?? {
      totals: true,
      visits: true,
      waitings: true,
      surveys: true,
      coupons: true,
    };
    if (wants.totals) requestedSources.push(source.totals);
    if (wants.visits) requestedSources.push(source.visits);
    if (wants.waitings) requestedSources.push(source.waitings);
    if (wants.surveys) requestedSources.push(source.surveys);
    if (wants.coupons) requestedSources.push(source.coupons);
    if (wants.websiteVisitors) requestedSources.push(source.websiteVisitors);
    if (wants.websiteStats) requestedSources.push(source.websiteStats);

    const allRequestedFailed =
      requestedSources.length > 0 &&
      requestedSources.every((item) => item.error && item.data.length === 0);
    if (allRequestedFailed) {
      const message = requestedSources.map((item) => item.error).filter(Boolean).at(0);
      throw new Error(message || "외부 API 데이터를 가져오지 못했습니다. API 설정을 확인해주세요.");
    }

    const data = buildDashboardV2(query, source);
    try {
      await setDashboardV2ApiCache(responseCacheKey, {
        expiresAt: Date.now() + DASHBOARD_RESPONSE_TTL_MS,
        value: data,
      });
    } catch (error) {
      console.warn("dashboard v2 response cache write failed", error);
    }
    return data;
  })();

  if (!query.bypassCache) pendingDashboardResponses.set(responseCacheKey, responsePromise);
  try {
    return { data: await responsePromise };
  } catch (error) {
    return {
      error: Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "외부 API 데이터를 가져오지 못했습니다. API 설정을 확인해주세요.",
        },
        { status: 502 }
      ),
    };
  } finally {
    pendingDashboardResponses.delete(responseCacheKey);
  }
}
