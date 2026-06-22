import { fetchAllPages } from "../src/lib/dashboard-v3/api-client";
import { getDashboardV3DbClient } from "../src/lib/dashboard-v3/db";
import { V3_CENTERS } from "../src/lib/dashboard-v3/types";

const sourceType = process.argv[2] || "survey";
const pathBySource: Record<string, string> = {
  total: "/external/total",
  visit: "/external/visits",
  survey: "/external/surveys",
  coupon: "/external/coupons",
  waiting: "/external/waitings",
};
const startDate = process.argv[3] || "2026-06-16";
const endDate = process.argv[4] || startDate;

function sourceKey(row: Record<string, unknown>) {
  if (row.id != null) return `${sourceType}:${String(row.id)}`;
  return [
    sourceType,
    row.center_type ?? "center",
    row.entered_at ?? row.created_at ?? row.survey_created_at ?? row.give_at ?? row.used_at ?? row.finished_at ?? "date",
    (row.user as { contact?: string } | undefined)?.contact ?? row.contact ?? "",
  ].join("|");
}

async function main() {
  const path = pathBySource[sourceType];
  if (!path) throw new Error(`Unknown source type: ${sourceType}`);

  const all: Array<Record<string, unknown>> = [];
  for (const center of V3_CENTERS) {
    const collection = await fetchAllPages<Record<string, unknown>>(
      path,
      { center_type: center.code, started_at: startDate, finished_at: endDate },
      false,
      500
    );
    const rows = collection.data.map((row) => ({
      ...row,
      center_type: row.center_type ?? center.code,
      format_center_type: row.format_center_type ?? center.name,
    }));
    console.log(
      JSON.stringify({
        center: center.name,
        apiRows: rows.length,
        total: collection.total,
        truncated: collection.truncated,
        error: collection.error,
      })
    );
    all.push(...rows);
  }

  const byKey = new Map<string, Array<Record<string, unknown>>>();
  for (const row of all) {
    const key = sourceKey(row);
    byKey.set(key, [...(byKey.get(key) || []), row]);
  }
  const duplicates = [...byKey.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      centers: rows.map((row) => row.format_center_type ?? row.center_type),
      dates: rows.map((row) => row.entered_at ?? row.created_at ?? row.survey_created_at ?? row.give_at ?? row.used_at ?? row.finished_at),
      contacts: rows.map((row) => (row.user as { contact?: string } | undefined)?.contact ?? row.contact ?? null),
    }));

  const client = getDashboardV3DbClient();
  if (!client) throw new Error("V3 DB is not configured.");
  const db = await client.execute({
    sql: `
      SELECT source_key
      FROM dashboard_v3_raw_records
      WHERE source_type = ?
        AND occurred_date >= ?
        AND occurred_date <= ?
        AND center_code IN (2, 3, 4)
    `,
    args: [sourceType, startDate, endDate],
  });
  const dbKeys = new Set(db.rows.map((row) => String(row.source_key)));
  const apiKeys = new Set([...byKey.keys()]);
  const missingInDb = [...apiKeys].filter((key) => !dbKeys.has(key));
  const extraInDb = [...dbKeys].filter((key) => !apiKeys.has(key));
  const sampleMissingKey = missingInDb[0];
  const missingApiRows = sampleMissingKey ? byKey.get(sampleMissingKey) || [] : [];
  const dbByMissingKey = sampleMissingKey
    ? await client.execute({
        sql: `
          SELECT source_key, center_code, center_name, occurred_date, payload_json
          FROM dashboard_v3_raw_records
          WHERE source_key = ?
        `,
        args: [sampleMissingKey],
      })
    : { rows: [] };

  console.log(
    JSON.stringify(
      {
        sourceType,
        period: `${startDate}~${endDate}`,
        apiRows: all.length,
        distinctKeys: byKey.size,
        dbRows: db.rows.length,
        duplicateKeyCount: duplicates.length,
        duplicateRows: duplicates.reduce((sum, item) => sum + item.count, 0),
        missingInDb: missingInDb.slice(0, 20),
        extraInDb: extraInDb.slice(0, 20),
        missingApiRows: missingApiRows.map((row) => ({
          id: row.id,
          center_type: row.center_type,
          format_center_type: row.format_center_type,
          entered_at: row.entered_at,
          created_at: row.created_at,
          survey_created_at: row.survey_created_at,
        })),
        dbByMissingKey: dbByMissingKey.rows.map((row) => ({
          source_key: row.source_key,
          center_code: row.center_code,
          center_name: row.center_name,
          occurred_date: row.occurred_date,
          payload: String(row.payload_json).slice(0, 400),
        })),
        duplicates: duplicates.slice(0, 20),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
