import { buildDashboardV3 } from "../src/lib/dashboard-v3/aggregator";
import { getDashboardV3DbClient } from "../src/lib/dashboard-v3/db";
import { syncDashboardV3Range } from "../src/lib/dashboard-v3/warehouse";
import { V3_CENTERS, V3CenterFilter, V3Query, V3SourceBundle } from "../src/lib/dashboard-v3/types";

type SourceType = "total" | "visit" | "survey" | "coupon" | "waiting";

const ALL_SOURCE_TYPES: SourceType[] = ["total", "visit", "survey", "coupon", "waiting"];
const CENTERS: V3CenterFilter[] = ["ALL", ...V3_CENTERS.map((center) => center.code)];
const ranges = [
  { key: "recent7", label: "최근 7일", startDate: "2026-06-16", endDate: "2026-06-22" },
  { key: "thisMonth", label: "이번달", startDate: "2026-06-01", endDate: "2026-06-22" },
  { key: "lastMonth", label: "지난달", startDate: "2026-05-01", endDate: "2026-05-31" },
];

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function selectedSources() {
  const raw = arg("source") || arg("sources") || "total,visit,survey,waiting";
  const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
  for (const value of values) {
    if (!ALL_SOURCE_TYPES.includes(value as SourceType)) {
      throw new Error(`지원하지 않는 source 입니다: ${value}`);
    }
  }
  return values as SourceType[];
}

function selectedRanges() {
  const raw = arg("range") || arg("ranges");
  if (!raw) return ranges;
  const keys = new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
  return ranges.filter((range) => keys.has(range.key));
}

function requireClient() {
  const client = getDashboardV3DbClient();
  if (!client) throw new Error("V3_DATABASE_URL is required.");
  return client;
}

function centerCodes(center: V3CenterFilter) {
  return center === "ALL" ? V3_CENTERS.map((item) => item.code) : [center];
}

function dateRange(startDate: string, endDate: string) {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function rawCount(sourceType: SourceType, startDate: string, endDate: string, center: V3CenterFilter) {
  const client = requireClient();
  const centers = centerCodes(center);
  const placeholders = centers.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT COUNT(*) AS count
      FROM dashboard_v3_raw_records
      WHERE source_type = ?
        AND occurred_date >= ?
        AND occurred_date <= ?
        AND center_code IN (${placeholders})
    `,
    args: [sourceType, startDate, endDate, ...centers],
  });
  return Number(result.rows[0]?.count ?? 0);
}

async function markDerivedCoverage(startDate: string, endDate: string) {
  const client = requireClient();
  const sourceTypes = selectedSources();

  for (const center of V3_CENTERS) {
    for (const sourceType of sourceTypes) {
      const count = await rawCount(sourceType, startDate, endDate, center.code);
      await client.execute({
        sql: `
          INSERT INTO dashboard_v3_source_coverage
            (source_type, range_start, range_end, center_filter, rows_fetched, rows_upserted, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
          ON CONFLICT(source_type, range_start, range_end, center_filter) DO UPDATE SET
            rows_fetched = excluded.rows_fetched,
            updated_at = CURRENT_TIMESTAMP
        `,
        args: [sourceType, startDate, endDate, String(center.code), count],
      });
    }
  }
}

async function coverageRows(sourceType: SourceType, startDate: string, endDate: string, center: V3CenterFilter) {
  const client = requireClient();
  const result = await client.execute({
    sql: `
      SELECT rows_fetched, rows_upserted
      FROM dashboard_v3_source_coverage
      WHERE source_type = ?
        AND range_start = ?
        AND range_end = ?
        AND center_filter = ?
      LIMIT 1
    `,
    args: [sourceType, startDate, endDate, String(center)],
  });
  const row = result.rows[0];
  return row
    ? { rowsFetched: Number(row.rows_fetched ?? 0), rowsUpserted: Number(row.rows_upserted ?? 0) }
    : { rowsFetched: 0, rowsUpserted: 0 };
}

async function readSource(query: V3Query): Promise<V3SourceBundle> {
  const client = requireClient();
  async function read(sourceType: SourceType) {
    const centers = centerCodes(query.center);
    const placeholders = centers.map(() => "?").join(", ");
    const result = await client.execute({
      sql: `
        SELECT payload_json
        FROM dashboard_v3_raw_records
        WHERE source_type = ?
          AND occurred_date >= ?
          AND occurred_date <= ?
          AND center_code IN (${placeholders})
        ORDER BY occurred_date, center_code, source_key
      `,
      args: [sourceType, query.startDate, query.endDate, ...centers],
    });
    return result.rows.map((row) => JSON.parse(String(row.payload_json)));
  }

  const [totals, visits, surveys, coupons, waitings] = await Promise.all([
    read("total"),
    read("visit"),
    read("survey"),
    read("coupon"),
    read("waiting"),
  ]);

  return {
    totals: { data: totals, total: totals.length },
    cumulativeTotals: { data: totals, total: totals.length },
    visits: { data: visits, total: visits.length },
    surveys: { data: surveys, total: surveys.length },
    coupons: { data: coupons, total: coupons.length },
    waitings: { data: waitings, total: waitings.length },
    websiteVisitors: { data: [], total: 0 },
    websiteStats: { data: [], total: 0 },
    fetchedAt: new Date().toISOString(),
  } as V3SourceBundle;
}

async function verifyRange(range: (typeof ranges)[number]) {
  const sourceChecks = [];
  const sourceTypes = selectedSources();
  for (const center of CENTERS) {
    for (const sourceType of sourceTypes) {
      const [raw, coverage] = await Promise.all([
        rawCount(sourceType, range.startDate, range.endDate, center),
        coverageRows(sourceType, range.startDate, range.endDate, center),
      ]);
      sourceChecks.push({
        center,
        sourceType,
        raw,
        coverageFetched: coverage.rowsFetched,
        ok: raw === coverage.rowsFetched,
      });
    }
  }

  const source = await readSource({
    startDate: range.startDate,
    endDate: range.endDate,
    center: "ALL",
  });
  const dashboard = buildDashboardV3(
    { startDate: range.startDate, endDate: range.endDate, center: "ALL" },
    source
  );

  return {
    range: range.label,
    period: `${range.startDate}~${range.endDate}`,
    allChecksOk: sourceChecks.every((item) => item.ok),
    sourceChecks,
    kpis: {
      totalVisits: dashboard.kpis.totalVisits,
      uniqueUsers: dashboard.kpis.uniqueUsers,
      cumulativeVisits: dashboard.kpis.cumulativeVisits,
      revisitUsers: dashboard.kpis.revisitUsers,
      revisitRate: dashboard.kpis.revisitRate,
    },
    centers: dashboard.centers.map((center) => ({
      center: center.center,
      visits: center.visits,
      uniqueUsers: center.uniqueUsers,
      cumulativeVisits: center.cumulativeVisits,
      revisitRate: center.standardRevisitRate,
    })),
  };
}

async function main() {
  const startedAt = Date.now();
  const reports = [];
  const sourceTypes = selectedSources();

  for (const range of selectedRanges()) {
    console.log(`[prefill:start] ${range.label} ${range.startDate}~${range.endDate}`);
    const syncs = [];
    for (const day of dateRange(range.startDate, range.endDate)) {
      for (const sourceType of sourceTypes) {
        const sourceStartedAt = Date.now();
        console.log(`[prefill:day-source:start] ${range.label} ${day} ${sourceType}`);
        const sync = await syncDashboardV3Range({
          startDate: day,
          endDate: day,
          center: "ALL",
          triggeredBy: `prefill:${range.key}:${sourceType}`,
          sourceTypes: [sourceType],
        });
        const raw = await rawCount(sourceType, day, day, "ALL");
        const coverage = await coverageRows(sourceType, day, day, "ALL");
        console.log(
          JSON.stringify(
            {
              event: "prefill:day-source:done",
              range: range.label,
              day,
              sourceType,
              elapsedSeconds: Math.round((Date.now() - sourceStartedAt) / 1000),
              sync,
              raw,
              coverageFetched: coverage.rowsFetched,
              ok: raw === coverage.rowsFetched,
            },
            null,
            2
          )
        );
        syncs.push(sync);
      }
    }
    await markDerivedCoverage(range.startDate, range.endDate);
    const verification = await verifyRange(range);
    console.log(
      JSON.stringify(
        {
          event: "prefill:done",
          range: range.label,
          sync: {
            fetched: syncs.reduce((sum, item) => sum + item.fetched, 0),
            upserted: syncs.reduce((sum, item) => sum + item.upserted, 0),
            jobs: syncs.map((item) => item.jobId),
          },
          allChecksOk: verification.allChecksOk,
          kpis: verification.kpis,
        },
        null,
        2
      )
    );
    reports.push({ sync: syncs, verification });
  }

  const failed = reports.flatMap((report) => report.verification.sourceChecks.filter((item) => !item.ok));
  console.log(
    JSON.stringify(
      {
        status: failed.length ? "failed" : "success",
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        failedChecks: failed,
        reports: reports.map((report) => report.verification),
      },
      null,
      2
    )
  );

  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
