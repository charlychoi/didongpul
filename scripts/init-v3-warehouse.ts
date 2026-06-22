import { ensureDashboardV3Warehouse } from "../src/lib/dashboard-v3/warehouse";
import { getDashboardV3DatabaseStatus } from "../src/lib/dashboard-v3/db";

async function main() {
  const status = getDashboardV3DatabaseStatus();
  const client = await ensureDashboardV3Warehouse();
  const tables = await client.execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'dashboard_v3_%'
    ORDER BY name
  `);

  console.log(
    JSON.stringify(
      {
        status,
        tables: tables.rows.map((row) => row.name),
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
