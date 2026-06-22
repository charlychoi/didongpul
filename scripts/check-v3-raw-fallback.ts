import { ensureDashboardV3Warehouse, getOrSyncDashboardV3Source } from "../src/lib/dashboard-v3/warehouse";

async function main() {
  const client = await ensureDashboardV3Warehouse();
  const rows = [
    {
      id: 1,
      center_type: 2,
      format_center_type: "강동센터",
      entered_at: "2026-06-16 10:00:00",
      leaved_at: "2026-06-16 11:00:00",
      user: { contact: "010-0000-0001", name: "테스트1" },
    },
    {
      id: 2,
      center_type: 3,
      format_center_type: "도봉센터",
      entered_at: "2026-06-17 10:00:00",
      leaved_at: "2026-06-17 11:00:00",
      user: { contact: "010-0000-0002", name: "테스트2" },
    },
  ];

  for (const sourceType of ["total", "visit"]) {
    for (const row of rows) {
      await client.execute({
        sql: `
          INSERT OR REPLACE INTO dashboard_v3_raw_records
            (id, source_type, source_key, center_code, center_name, occurred_date, user_key, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          `${sourceType}:${row.id}`,
          sourceType,
          `${sourceType}:${row.id}`,
          row.center_type,
          row.format_center_type,
          row.entered_at.slice(0, 10),
          row.user.contact,
          JSON.stringify(row),
        ],
      });
    }
  }

  const result = await getOrSyncDashboardV3Source(
    { startDate: "2026-06-16", endDate: "2026-06-22", center: "ALL", bypassCache: false },
    { totals: true, visits: true }
  );
  const summary = {
    storage: result.storage,
    fetched: result.fetched,
    totals: result.source.totals.data.length,
    visits: result.source.visits.data.length,
    hasBackground: Boolean(result.backgroundStore),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (
    summary.storage !== "db_partial" ||
    summary.fetched !== 0 ||
    summary.totals !== 2 ||
    summary.visits !== 2 ||
    summary.hasBackground
  ) {
    throw new Error("v3 raw fallback should use DB rows without API fetch.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
