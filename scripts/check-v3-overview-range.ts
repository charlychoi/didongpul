import { buildDashboardV3 } from "../src/lib/dashboard-v3/aggregator";
import { getOrSyncDashboardV3Source } from "../src/lib/dashboard-v3/warehouse";
import { V3_CENTERS, V3CenterFilter } from "../src/lib/dashboard-v3/types";

const startDate = process.argv[2] || "2026-06-16";
const endDate = process.argv[3] || "2026-06-22";
const centerArg = process.argv[4] || "ALL";
const center =
  centerArg === "ALL"
    ? "ALL"
    : V3_CENTERS.some((item) => item.code === Number(centerArg))
      ? (Number(centerArg) as V3CenterFilter)
      : "ALL";

async function main() {
  const query = { startDate, endDate, center, bypassCache: false };
  const result = await getOrSyncDashboardV3Source(query, { totals: true, visits: true });
  const data = buildDashboardV3(query, result.source);

  console.log(
    JSON.stringify(
      {
        storage: result.storage,
        fetched: result.fetched,
        upserted: result.upserted,
        sync: data.sync,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
