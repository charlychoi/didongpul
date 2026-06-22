import { getOrSyncDashboardV3Source } from "../src/lib/dashboard-v3/warehouse";
import type { V3Query } from "../src/lib/dashboard-v3/types";

async function main() {
  const query: V3Query = {
    startDate: process.env.V3_TEST_START_DATE || "2026-06-19",
    endDate: process.env.V3_TEST_END_DATE || "2026-06-19",
    center: Number(process.env.V3_TEST_CENTER || 2) as V3Query["center"],
    bypassCache: false,
  };
  const options = { totals: true };

  const first = await getOrSyncDashboardV3Source(query, options);
  const second = await getOrSyncDashboardV3Source(query, options);

  if (first.storage !== "api_then_db" && first.storage !== "db") {
    throw new Error(`first lookup used unexpected storage: ${first.storage}`);
  }
  if (second.storage !== "db") {
    throw new Error(`second lookup should use db, got ${second.storage}`);
  }
  if (second.source.totals.data.length === 0) {
    throw new Error("warehouse lookup returned no total rows");
  }

  console.log(
    JSON.stringify(
      {
        first: {
          storage: first.storage,
          fetched: first.fetched,
          upserted: first.upserted,
          rows: first.source.totals.data.length,
        },
        second: {
          storage: second.storage,
          fetched: second.fetched,
          upserted: second.upserted,
          rows: second.source.totals.data.length,
        },
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
