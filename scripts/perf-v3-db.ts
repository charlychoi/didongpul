import { performance } from "node:perf_hooks";
import { buildDashboardV3 } from "../src/lib/dashboard-v3/aggregator";
import { getOrSyncDashboardV3Source } from "../src/lib/dashboard-v3/warehouse";

const cases = [
  {
    name: "운영종합 최근7일 전체 1회차",
    query: { startDate: "2026-06-16", endDate: "2026-06-22", center: "ALL" as const, bypassCache: false },
    options: { totals: true, visits: true },
  },
  {
    name: "운영종합 최근7일 전체 2회차",
    query: { startDate: "2026-06-16", endDate: "2026-06-22", center: "ALL" as const, bypassCache: false },
    options: { totals: true, visits: true },
  },
  {
    name: "운영종합 오늘 전체",
    query: { startDate: "2026-06-22", endDate: "2026-06-22", center: "ALL" as const, bypassCache: false },
    options: { totals: true, visits: true },
  },
  {
    name: "운영종합 최근7일 강동",
    query: { startDate: "2026-06-16", endDate: "2026-06-22", center: 2 as const, bypassCache: false },
    options: { totals: true, visits: true },
  },
];

async function main() {
  const results = [];
  for (const item of cases) {
    const started = performance.now();
    const result = await getOrSyncDashboardV3Source(item.query, item.options);
    const data = buildDashboardV3(item.query, result.source);
    results.push({
      name: item.name,
      ms: Math.round(performance.now() - started),
      storage: result.storage,
      fetched: result.fetched,
      hasBackgroundStore: Boolean(result.backgroundStore),
      totalRows: result.source.totals.data.length,
      visitRows: result.source.visits.data.length,
      totalVisits: data.kpis.totalVisits,
      uniqueUsers: data.kpis.uniqueUsers,
      revisitRate: data.kpis.revisitRate,
      partial: data.sync.partial,
    });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
