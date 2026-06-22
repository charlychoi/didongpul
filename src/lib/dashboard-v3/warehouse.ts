import { Client } from "@libsql/client";
import { buildDashboardV3 } from "./aggregator";
import { DashboardV3SourceOptions, fetchAllPages } from "./api-client";
import { getDashboardV3DbClient } from "./db";
import {
  DidongCouponRow,
  DidongSurveyRow,
  DidongTotalRow,
  DidongVisitRow,
  DidongWaitingRow,
  V3_CENTERS,
  V3CenterFilter,
  V3Query,
  V3SourceBundle,
} from "./types";

type RawRow = DidongTotalRow | DidongVisitRow | DidongSurveyRow | DidongWaitingRow | DidongCouponRow;
type SourceType = "total" | "visit" | "survey" | "coupon" | "waiting";
type WarehouseStorage = "db" | "db_partial" | "api_only" | "api_pending_db";

type WarehouseResult = {
  source: V3SourceBundle;
  storage: WarehouseStorage;
  fetched: number;
  upserted: number;
  backgroundStore?: () => Promise<{ upserted: number }>;
};

type SyncOptions = {
  startDate: string;
  endDate: string;
  center: V3CenterFilter;
  triggeredBy?: string;
  includeExtendedSources?: boolean;
  sourceTypes?: SourceType[];
};

const SOURCE_PATHS: Record<SourceType, string> = {
  total: "/external/total",
  visit: "/external/visits",
  survey: "/external/surveys",
  coupon: "/external/coupons",
  waiting: "/external/waitings",
};

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const datePart = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (datePart) return datePart;
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function rowDate(row: RawRow) {
  return (
    parseDateOnly((row as DidongTotalRow).entered_at) ||
    parseDateOnly((row as DidongCouponRow).give_at) ||
    parseDateOnly((row as DidongCouponRow).used_at) ||
    parseDateOnly((row as DidongWaitingRow).finished_at) ||
    parseDateOnly((row as DidongSurveyRow).survey_created_at) ||
    parseDateOnly((row as { created_at?: string | null }).created_at) ||
    null
  );
}

function centerCode(row: RawRow) {
  const direct = row.center_type;
  const program = (row as DidongWaitingRow).program?.center_type;
  const value = direct ?? program;
  return value == null ? null : Number(value);
}

function centerName(row: RawRow) {
  const direct = row.format_center_type;
  const program = (row as DidongWaitingRow).program?.format_center_type;
  const code = centerCode(row);
  return direct || program || V3_CENTERS.find((center) => center.code === code)?.name || "미상";
}

function selectedCenters(center: V3CenterFilter) {
  return center === "ALL" ? V3_CENTERS : V3_CENTERS.filter((item) => item.code === center);
}

function cumulativeStartDateForQuery(center: V3CenterFilter) {
  const starts = selectedCenters(center).map((item) => item.cumulativeStartDate);
  return starts.sort()[0] || "2025-11-01";
}

async function fetchSyncRows<T extends RawRow>(sourceType: SourceType, query: V3Query) {
  const collections = await Promise.all(
    selectedCenters(query.center).map(async (center) => {
      const collection = await fetchAllPages<T>(
      SOURCE_PATHS[sourceType],
      {
        center_type: center.code,
        started_at: query.startDate,
        finished_at: query.endDate,
      },
      query.bypassCache,
      500
      ).catch((error) => ({
      data: [],
      total: 0,
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
      }));

      return {
        collection,
        rows: collection.data.map((row) => ({
          ...row,
          center_type: row.center_type ?? center.code,
          format_center_type: row.format_center_type ?? center.name,
        })),
      };
    })
  );

  const rows = collections.flatMap((item) => item.rows);
  const errors = collections.map((item) => item.collection.error).filter(Boolean);
  const truncated = collections.some((item) => item.collection.truncated === true);

  return {
    data: rows,
    total: rows.length,
    truncated,
    error: errors.join("\n") || undefined,
  };
}

function userStableKey(row: RawRow) {
  const user = row.user;
  const total = row as DidongTotalRow;
  return (
    user?.contact ||
    total.contact ||
    user?.id?.toString() ||
    user?.uuid ||
    [total.name, total.entered_at, total.center_type].filter(Boolean).join("|") ||
    "unknown"
  );
}

function sourceRecordKey(sourceType: string, row: RawRow) {
  const id = row.id ?? (row as { uuid?: string | number | null }).uuid;
  if (id != null) return `${sourceType}:${id}`;
  return [
    sourceType,
    centerCode(row) ?? "center",
    rowDate(row) ?? "date",
    userStableKey(row),
    (row as DidongTotalRow).entered_at ?? "",
    (row as DidongTotalRow).leaved_at ?? "",
  ].join("|");
}

async function executeBatch(client: Client, sql: string) {
  for (const statement of sql.split(";").map((item) => item.trim()).filter(Boolean)) {
    await client.execute(statement);
  }
}

export async function ensureDashboardV3Warehouse() {
  const client = getDashboardV3DbClient();
  if (!client) {
    throw new Error("V3_DATABASE_URL 환경변수가 필요합니다.");
  }

  await executeBatch(
    client,
    `
      CREATE TABLE IF NOT EXISTS dashboard_v3_sync_jobs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT,
        range_start TEXT NOT NULL,
        range_end TEXT NOT NULL,
        center_filter TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        triggered_by TEXT NOT NULL DEFAULT 'manual',
        rows_fetched INTEGER NOT NULL DEFAULT 0,
        rows_upserted INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS dashboard_v3_raw_records (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_key TEXT NOT NULL UNIQUE,
        center_code INTEGER,
        center_name TEXT,
        occurred_date TEXT,
        user_key TEXT,
        visit_count_label TEXT,
        payload_json TEXT NOT NULL,
        first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_v3_raw_records_lookup
        ON dashboard_v3_raw_records (source_type, occurred_date, center_code);

      CREATE TABLE IF NOT EXISTS dashboard_v3_source_coverage (
        source_type TEXT NOT NULL,
        range_start TEXT NOT NULL,
        range_end TEXT NOT NULL,
        center_filter TEXT NOT NULL,
        rows_fetched INTEGER NOT NULL DEFAULT 0,
        rows_upserted INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (source_type, range_start, range_end, center_filter)
      );

      CREATE TABLE IF NOT EXISTS dashboard_v3_daily_center_summary (
        summary_date TEXT NOT NULL,
        center_code INTEGER NOT NULL,
        center_name TEXT NOT NULL,
        visit_count INTEGER NOT NULL DEFAULT 0,
        unique_visitor_count INTEGER NOT NULL DEFAULT 0,
        new_visit_count INTEGER NOT NULL DEFAULT 0,
        revisit_count INTEGER NOT NULL DEFAULT 0,
        revisit_rate REAL NOT NULL DEFAULT 0,
        avg_stay_minutes REAL NOT NULL DEFAULT 0,
        raw_total_rows INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (summary_date, center_code)
      );

      CREATE TABLE IF NOT EXISTS dashboard_v3_monthly_center_summary (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        center_code INTEGER NOT NULL,
        center_name TEXT NOT NULL,
        visit_count INTEGER NOT NULL DEFAULT 0,
        unique_visitor_count INTEGER NOT NULL DEFAULT 0,
        new_visit_count INTEGER NOT NULL DEFAULT 0,
        revisit_count INTEGER NOT NULL DEFAULT 0,
        revisit_rate REAL NOT NULL DEFAULT 0,
        avg_stay_minutes REAL NOT NULL DEFAULT 0,
        raw_total_rows INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (year, month, center_code)
      );
    `
  );

  return client;
}

async function createSyncJob(client: Client, options: SyncOptions) {
  const id = crypto.randomUUID();
  await client.execute({
    sql: `
      INSERT INTO dashboard_v3_sync_jobs (id, range_start, range_end, center_filter, triggered_by)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [id, options.startDate, options.endDate, String(options.center), options.triggeredBy || "manual"],
  });
  return id;
}

async function finishSyncJob(
  client: Client,
  id: string,
  status: "success" | "failed",
  rowsFetched: number,
  rowsUpserted: number,
  errorMessage?: string
) {
  await client.execute({
    sql: `
      UPDATE dashboard_v3_sync_jobs
      SET finished_at = CURRENT_TIMESTAMP,
          status = ?,
          rows_fetched = ?,
          rows_upserted = ?,
          error_message = ?
      WHERE id = ?
    `,
    args: [status, rowsFetched, rowsUpserted, errorMessage ?? null, id],
  });
}

async function upsertRawRows(client: Client, sourceType: string, rows: RawRow[]) {
  let upserted = 0;
  for (const row of rows) {
    await client.execute({
      sql: `
        INSERT INTO dashboard_v3_raw_records
          (id, source_type, source_key, center_code, center_name, occurred_date, user_key, visit_count_label, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          center_code = excluded.center_code,
          center_name = excluded.center_name,
          occurred_date = excluded.occurred_date,
          user_key = excluded.user_key,
          visit_count_label = excluded.visit_count_label,
          payload_json = excluded.payload_json,
          last_seen_at = CURRENT_TIMESTAMP
      `,
      args: [
        crypto.randomUUID(),
        sourceType,
        sourceRecordKey(sourceType, row),
        centerCode(row),
        centerName(row),
        rowDate(row),
        userStableKey(row),
        (row as DidongTotalRow).count_visit == null ? null : String((row as DidongTotalRow).count_visit),
        JSON.stringify(row),
      ],
    });
    upserted += 1;
  }
  return upserted;
}

async function upsertSourceCoverage(
  client: Client,
  sourceType: SourceType,
  query: V3Query,
  rowsFetched: number,
  rowsUpserted: number
) {
  await client.execute({
    sql: `
      INSERT INTO dashboard_v3_source_coverage
        (source_type, range_start, range_end, center_filter, rows_fetched, rows_upserted, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_type, range_start, range_end, center_filter) DO UPDATE SET
        rows_fetched = excluded.rows_fetched,
        rows_upserted = excluded.rows_upserted,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [sourceType, query.startDate, query.endDate, String(query.center), rowsFetched, rowsUpserted],
  });
}

function requestedSourceTypes(options?: DashboardV3SourceOptions): SourceType[] {
  const wants = options ?? {
    totals: true,
    visits: true,
    waitings: true,
    surveys: true,
    coupons: true,
  };
  const sourceTypes: SourceType[] = [];
  if (wants.totals) sourceTypes.push("total");
  if (wants.visits) sourceTypes.push("visit");
  if (wants.surveys) sourceTypes.push("survey");
  if (wants.coupons) sourceTypes.push("coupon");
  if (wants.waitings) sourceTypes.push("waiting");
  return sourceTypes;
}

async function hasExactCoverage(client: Client, query: V3Query, sourceTypes: SourceType[]) {
  if (sourceTypes.length === 0) return true;
  const covered = await coveredSourceTypes(client, query, sourceTypes);
  return covered.size === sourceTypes.length;
}

async function coveredSourceTypes(client: Client, query: V3Query, sourceTypes: SourceType[]) {
  if (sourceTypes.length === 0) return new Set<string>();
  const placeholders = sourceTypes.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT source_type
      FROM dashboard_v3_source_coverage
      WHERE range_start = ?
        AND range_end = ?
        AND center_filter = ?
        AND source_type IN (${placeholders})
    `,
    args: [query.startDate, query.endDate, String(query.center), ...sourceTypes],
  });
  return new Set(result.rows.map((row) => String(row.source_type)));
}

async function availableRawSourceTypes(client: Client, query: V3Query, sourceTypes: SourceType[]) {
  if (sourceTypes.length === 0) return new Set<string>();
  const centers = selectedCenters(query.center).map((center) => center.code);
  const sourcePlaceholders = sourceTypes.map(() => "?").join(", ");
  const centerPlaceholders = centers.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT source_type, COUNT(*) AS row_count
      FROM dashboard_v3_raw_records
      WHERE source_type IN (${sourcePlaceholders})
        AND occurred_date >= ?
        AND occurred_date <= ?
        AND center_code IN (${centerPlaceholders})
      GROUP BY source_type
      HAVING row_count > 0
    `,
    args: [...sourceTypes, query.startDate, query.endDate, ...centers],
  });
  return new Set(result.rows.map((row) => String(row.source_type)));
}

async function readRawRows<T extends RawRow>(client: Client, sourceType: SourceType, query: V3Query) {
  const centers = selectedCenters(query.center).map((center) => center.code);
  const centerFilter = centers.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT payload_json
      FROM dashboard_v3_raw_records
      WHERE source_type = ?
        AND occurred_date >= ?
        AND occurred_date <= ?
        AND center_code IN (${centerFilter})
      ORDER BY occurred_date, center_code, source_key
    `,
    args: [sourceType, query.startDate, query.endDate, ...centers],
  });

  return result.rows.map((row) => JSON.parse(String(row.payload_json)) as T);
}

async function readWarehouseSource(
  client: Client,
  query: V3Query,
  sourceTypes: SourceType[] = ["total", "visit", "survey", "coupon", "waiting"]
): Promise<V3SourceBundle> {
  const wants = new Set(sourceTypes);
  const [totals, visits, surveys, coupons, waitings] = await Promise.all([
    wants.has("total") ? readRawRows<DidongTotalRow>(client, "total", query) : Promise.resolve([]),
    wants.has("visit") ? readRawRows<DidongVisitRow>(client, "visit", query) : Promise.resolve([]),
    wants.has("survey") ? readRawRows<DidongSurveyRow>(client, "survey", query) : Promise.resolve([]),
    wants.has("coupon") ? readRawRows<DidongCouponRow>(client, "coupon", query) : Promise.resolve([]),
    wants.has("waiting") ? readRawRows<DidongWaitingRow>(client, "waiting", query) : Promise.resolve([]),
  ]);

  return {
    totals: { data: totals, total: totals.length, truncated: false },
    cumulativeTotals: { data: [], total: 0, truncated: false },
    visits: { data: visits, total: visits.length, truncated: false },
    surveys: { data: surveys, total: surveys.length, truncated: false },
    coupons: { data: coupons, total: coupons.length, truncated: false },
    waitings: { data: waitings, total: waitings.length, truncated: false },
    websiteVisitors: { data: [], total: 0 },
    websiteStats: { data: [], total: 0 },
    fetchedAt: new Date().toISOString(),
  };
}

function emptySourceBundle(): V3SourceBundle {
  return {
    totals: { data: [], total: 0 },
    cumulativeTotals: { data: [], total: 0 },
    visits: { data: [], total: 0 },
    surveys: { data: [], total: 0 },
    coupons: { data: [], total: 0 },
    waitings: { data: [], total: 0 },
    websiteVisitors: { data: [], total: 0 },
    websiteStats: { data: [], total: 0 },
    fetchedAt: new Date().toISOString(),
  };
}

function collectionForSource(source: V3SourceBundle, sourceType: SourceType) {
  if (sourceType === "total") return source.totals;
  if (sourceType === "visit") return source.visits;
  if (sourceType === "survey") return source.surveys;
  if (sourceType === "coupon") return source.coupons;
  return source.waitings;
}

async function fetchApiSource(query: V3Query, sourceTypes: SourceType[]) {
  const source = emptySourceBundle();

  const results = await Promise.all(sourceTypes.map(async (sourceType) => {
    const collection = await fetchSyncRows(sourceType, query);
    return { sourceType, collection };
  }));

  for (const { sourceType, collection } of results) {
    if (sourceType === "total") source.totals = collection as V3SourceBundle["totals"];
    if (sourceType === "visit") source.visits = collection as V3SourceBundle["visits"];
    if (sourceType === "survey") source.surveys = collection as V3SourceBundle["surveys"];
    if (sourceType === "coupon") source.coupons = collection as V3SourceBundle["coupons"];
    if (sourceType === "waiting") source.waitings = collection as V3SourceBundle["waitings"];
  }

  source.fetchedAt = new Date().toISOString();
  const fetched = results.reduce((sum, item) => sum + item.collection.data.length, 0);
  return { source, fetched };
}

async function storeApiSource(
  client: Client,
  query: V3Query,
  sourceTypes: SourceType[],
  source: V3SourceBundle
) {
  let upserted = 0;
  for (const sourceType of sourceTypes) {
    const collection = collectionForSource(source, sourceType);
    if (collection.error) continue;
    const rows = collection.data as RawRow[];
    const sourceUpserted = await upsertRawRows(client, sourceType, rows);
    await upsertSourceCoverage(client, sourceType, query, rows.length, sourceUpserted);
    upserted += sourceUpserted;
  }

  if (sourceTypes.includes("total")) {
    const storedSource = await readWarehouseSource(client, query, sourceTypes);
    storedSource.cumulativeTotals = await readCumulativeTotals(client, query);
    await writeSummaries(client, query, storedSource);
  }

  return { upserted };
}

async function readCumulativeTotals(client: Client, query: V3Query) {
  const cumulativeQuery: V3Query = {
    ...query,
    startDate: cumulativeStartDateForQuery(query.center),
    endDate: query.endDate,
  };
  const rows = await readRawRows<DidongTotalRow>(client, "total", cumulativeQuery);
  return { data: rows, total: rows.length, truncated: false };
}

async function ensureCumulativeTotals(client: Client, query: V3Query) {
  const cumulativeQuery: V3Query = {
    ...query,
    startDate: cumulativeStartDateForQuery(query.center),
    endDate: query.endDate,
  };
  const hasCoverage = !query.bypassCache && (await hasExactCoverage(client, cumulativeQuery, ["total"]));

  // 화면 조회에서 2025년부터의 대량 누적 API를 즉시 호출하면 응답 지연/타임아웃이 발생한다.
  // 누적 데이터는 별도 sync로 쌓고, 대시보드는 현재 DB에 쌓인 누적분을 우선 활용한다.
  if (!hasCoverage && process.env.V3_ENABLE_CUMULATIVE_SYNC === "1") {
    await fetchAndStoreSourceType(client, "total", cumulativeQuery);
  }
  return readCumulativeTotals(client, query);
}

async function fetchAndStoreSourceType(client: Client, sourceType: SourceType, query: V3Query) {
  const collection = await fetchSyncRows(sourceType, query);
  if (collection.error) throw new Error(collection.error);
  const upserted = await upsertRawRows(client, sourceType, collection.data);
  await upsertSourceCoverage(client, sourceType, query, collection.data.length, upserted);
  return { fetched: collection.data.length, upserted };
}

export async function getOrSyncDashboardV3Source(
  query: V3Query,
  options?: DashboardV3SourceOptions
): Promise<WarehouseResult> {
  const sourceTypes = requestedSourceTypes(options);
  const client = await ensureDashboardV3Warehouse().catch(() => null);
  if (!client) {
    const { source, fetched } = await fetchApiSource(query, sourceTypes);
    return {
      source,
      storage: "api_only",
      fetched,
      upserted: 0,
    };
  }

  const covered = !query.bypassCache ? await coveredSourceTypes(client, query, sourceTypes) : new Set<string>();
  const rawAvailable = !query.bypassCache
    ? await availableRawSourceTypes(client, query, sourceTypes)
    : new Set<string>();
  const usableSourceTypes = new Set([...covered, ...rawAvailable]);
  const missingSourceTypes = sourceTypes.filter((sourceType) => !usableSourceTypes.has(sourceType));

  if (missingSourceTypes.length > 0) {
    const { source, fetched } = await fetchApiSource(query, sourceTypes);
    source.cumulativeTotals = await readCumulativeTotals(client, query);
    return {
      source,
      storage: "api_pending_db",
      fetched,
      upserted: 0,
      backgroundStore: () => storeApiSource(client, query, sourceTypes, source),
    };
  }

  const source = await readWarehouseSource(client, query, sourceTypes);
  if (sourceTypes.includes("total")) {
    source.cumulativeTotals = await ensureCumulativeTotals(client, query);
  }
  const hasExactSourceCoverage = sourceTypes.every((sourceType) => covered.has(sourceType));
  return { source, storage: hasExactSourceCoverage ? "db" : "db_partial", fetched: 0, upserted: 0 };
}

function dateRange(startDate: string, endDate: string) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function writeSummaries(client: Client, query: V3Query, source: V3SourceBundle) {
  const centers = query.center === "ALL" ? V3_CENTERS : V3_CENTERS.filter((center) => center.code === query.center);

  for (const day of dateRange(query.startDate, query.endDate)) {
    for (const center of centers) {
      const daySource: V3SourceBundle = {
        ...source,
        totals: {
          ...source.totals,
          data: source.totals.data.filter(
            (row) => rowDate(row) === day && centerCode(row) === center.code
          ),
        },
        visits: { data: [], total: 0 },
      };
      const result = buildDashboardV3({ ...query, startDate: day, endDate: day, center: center.code }, daySource);
      await client.execute({
        sql: `
          INSERT INTO dashboard_v3_daily_center_summary
            (summary_date, center_code, center_name, visit_count, unique_visitor_count, new_visit_count,
             revisit_count, revisit_rate, avg_stay_minutes, raw_total_rows, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(summary_date, center_code) DO UPDATE SET
            visit_count = excluded.visit_count,
            unique_visitor_count = excluded.unique_visitor_count,
            new_visit_count = excluded.new_visit_count,
            revisit_count = excluded.revisit_count,
            revisit_rate = excluded.revisit_rate,
            avg_stay_minutes = excluded.avg_stay_minutes,
            raw_total_rows = excluded.raw_total_rows,
            updated_at = CURRENT_TIMESTAMP
        `,
        args: [
          day,
          center.code,
          center.name,
          result.kpis.totalVisits,
          result.kpis.uniqueUsers,
          result.kpis.newUsers,
          result.kpis.revisitUsers,
          result.kpis.revisitRate,
          result.kpis.avgStayMinutes,
          daySource.totals.data.length,
        ],
      });
    }
  }

  const monthly = new Map<string, { year: number; month: number; centerCode: number; centerName: string }>();
  for (const center of centers) {
    for (const day of dateRange(query.startDate, query.endDate)) {
      const [year, month] = day.split("-").map(Number);
      monthly.set(`${year}-${month}-${center.code}`, {
        year,
        month,
        centerCode: center.code,
        centerName: center.name,
      });
    }
  }

  for (const item of monthly.values()) {
    const startDate = `${item.year}-${String(item.month).padStart(2, "0")}-01`;
    const monthEnd = new Date(Date.UTC(item.year, item.month, 0)).toISOString().slice(0, 10);
    const endDate = monthEnd < query.endDate ? monthEnd : query.endDate;
    const monthSource: V3SourceBundle = {
      ...source,
      totals: {
        ...source.totals,
        data: source.totals.data.filter((row) => {
          const date = rowDate(row);
          return date && date >= startDate && date <= endDate && centerCode(row) === item.centerCode;
        }),
      },
      visits: { data: [], total: 0 },
    };
    const result = buildDashboardV3(
      { ...query, startDate, endDate, center: item.centerCode as V3CenterFilter },
      monthSource
    );
    await client.execute({
      sql: `
        INSERT INTO dashboard_v3_monthly_center_summary
          (year, month, center_code, center_name, visit_count, unique_visitor_count, new_visit_count,
           revisit_count, revisit_rate, avg_stay_minutes, raw_total_rows, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(year, month, center_code) DO UPDATE SET
          visit_count = excluded.visit_count,
          unique_visitor_count = excluded.unique_visitor_count,
          new_visit_count = excluded.new_visit_count,
          revisit_count = excluded.revisit_count,
          revisit_rate = excluded.revisit_rate,
          avg_stay_minutes = excluded.avg_stay_minutes,
          raw_total_rows = excluded.raw_total_rows,
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [
        item.year,
        item.month,
        item.centerCode,
        item.centerName,
        result.kpis.totalVisits,
        result.kpis.uniqueUsers,
        result.kpis.newUsers,
        result.kpis.revisitUsers,
        result.kpis.revisitRate,
        result.kpis.avgStayMinutes,
        monthSource.totals.data.length,
      ],
    });
  }
}

export async function syncDashboardV3Range(options: SyncOptions) {
  const client = await ensureDashboardV3Warehouse();
  const jobId = await createSyncJob(client, options);
  const query: V3Query = {
    startDate: options.startDate,
    endDate: options.endDate,
    center: options.center,
    bypassCache: true,
  };

  try {
    const sourceTypes =
      options.sourceTypes ??
      (options.includeExtendedSources ? (["total", "survey", "coupon", "waiting"] as SourceType[]) : (["total"] as SourceType[]));
    let fetched = 0;
    let upserted = 0;
    for (const sourceType of sourceTypes) {
      const result = await fetchAndStoreSourceType(client, sourceType, query);
      fetched += result.fetched;
      upserted += result.upserted;
    }
    const source: V3SourceBundle = {
      ...(await readWarehouseSource(client, query, sourceTypes)),
    };
    const sourceErrors = [source.totals]
      .map((collection) => collection.error)
      .filter(Boolean);
    if (sourceErrors.length) {
      throw new Error(sourceErrors.join("\n"));
    }
    if (sourceTypes.includes("total")) await writeSummaries(client, query, source);
    await finishSyncJob(client, jobId, "success", fetched, upserted);
    return { jobId, status: "success", fetched, upserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncJob(client, jobId, "failed", 0, 0, message);
    throw error;
  }
}
