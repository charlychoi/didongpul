import { performance } from "node:perf_hooks";
import { getOrSyncDashboardV3Source } from "../src/lib/dashboard-v3/warehouse";

async function main() {
  const query = {
    startDate: process.argv[2] || "2026-06-21",
    endDate: process.argv[3] || process.argv[2] || "2026-06-21",
    center: Number(process.argv[4] || "4") as 2 | 3 | 4,
    bypassCache: true,
  };
  const started = performance.now();
  const result = await getOrSyncDashboardV3Source(query, { totals: true, visits: true });
  console.log(
    JSON.stringify(
      {
        query,
        ms: Math.round(performance.now() - started),
        storage: result.storage,
        fetched: result.fetched,
        hasBackgroundStore: Boolean(result.backgroundStore),
        totalRows: result.source.totals.data.length,
        visitRows: result.source.visits.data.length,
        totalError: result.source.totals.error || null,
        visitError: result.source.visits.error || null,
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
