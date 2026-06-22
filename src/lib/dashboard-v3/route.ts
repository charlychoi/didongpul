import { after, NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { buildDashboardV3 } from "./aggregator";
import { DashboardV3SourceOptions } from "./api-client";
import { getDashboardV3ApiCache, getDashboardV3DatabaseStatus, setDashboardV3ApiCache } from "./db";
import { ApiCollection, V3_CENTERS, V3CenterFilter, V3Query } from "./types";
import { getOrSyncDashboardV3Source } from "./warehouse";

const DASHBOARD_RESPONSE_TTL_MS = 30 * 60 * 1000;
const DASHBOARD_RESPONSE_CACHE_VERSION = 11;
type DashboardV3Result = ReturnType<typeof buildDashboardV3>;
const pendingDashboardResponses = new Map<string, Promise<DashboardV3Result>>();

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoString() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return date.toISOString().slice(0, 10);
}

export function parseV3Query(request: NextRequest): V3Query {
  const { searchParams } = new URL(request.url);
  const centerRaw = searchParams.get("center") ?? "ALL";
  const center = centerRaw === "ALL" ? "ALL" : Number(centerRaw);
  const allowedCenter = V3_CENTERS.some((item) => item.code === center);

  return {
    startDate: searchParams.get("start_date") || sevenDaysAgoString(),
    endDate: searchParams.get("end_date") || todayString(),
    center: (center === "ALL" || allowedCenter ? center : "ALL") as V3CenterFilter,
    bypassCache: searchParams.get("refresh") === "1",
  };
}

export async function getDashboardV3(
  request: NextRequest,
  sourceOptions?: DashboardV3SourceOptions
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return { error: Response.json({ error: "인증이 필요합니다." }, { status: 401 }) };
  }

  const query = parseV3Query(request);
  getDashboardV3DatabaseStatus();
  const responseCacheKey = `dashboard-v3-response:${JSON.stringify({
    version: DASHBOARD_RESPONSE_CACHE_VERSION,
    query,
    sourceOptions,
  })}`;
  if (!query.bypassCache) {
    const pending = pendingDashboardResponses.get(responseCacheKey);
    if (pending) return { data: await pending };

    try {
      const cached = await getDashboardV3ApiCache(responseCacheKey);
      if (cached && !(cached.value as { sync?: { dbWritePending?: boolean } }).sync?.dbWritePending) {
        return { data: cached.value as DashboardV3Result };
      }
    } catch (error) {
      console.warn("dashboard v3 response cache read failed", error);
    }
  }

  const responsePromise = (async () => {
    const warehouseResult = await getOrSyncDashboardV3Source(query, sourceOptions);
    if (warehouseResult.backgroundStore) {
      after(async () => {
        try {
          const result = await warehouseResult.backgroundStore?.();
          console.log("dashboard v3 background warehouse store completed", {
            startDate: query.startDate,
            endDate: query.endDate,
            center: query.center,
            upserted: result?.upserted ?? 0,
          });
        } catch (error) {
          console.warn("dashboard v3 background warehouse store failed", error);
        }
      });
    }
    const source = warehouseResult.source;
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

    const data = buildDashboardV3(query, source);
    data.sync.source =
      warehouseResult.storage === "db"
        ? "dashboard v3 Turso/libSQL warehouse"
        : warehouseResult.storage === "db_partial"
          ? "dashboard v3 Turso/libSQL warehouse (sync needed)"
          : warehouseResult.storage === "api_pending_db"
            ? "didong external API (v3 DB 저장 중)"
            : "didong external API";
    data.sync.partial = data.sync.partial || warehouseResult.storage !== "db";
    const sync = data.sync as typeof data.sync & {
      storage?: string;
      dbWritePending?: boolean;
      rowsFetched?: number;
      rowsUpserted?: number;
    };
    sync.storage = warehouseResult.storage;
    sync.dbWritePending = warehouseResult.storage === "api_pending_db";
    sync.rowsFetched = warehouseResult.fetched;
    sync.rowsUpserted = warehouseResult.upserted;
    try {
      if (warehouseResult.storage !== "api_pending_db") {
        await setDashboardV3ApiCache(responseCacheKey, {
          expiresAt: Date.now() + DASHBOARD_RESPONSE_TTL_MS,
          value: data,
        });
      }
    } catch (error) {
      console.warn("dashboard v3 response cache write failed", error);
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
