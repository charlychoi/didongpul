import { syncDashboardV3Range } from "../src/lib/dashboard-v3/warehouse";
import { V3_CENTERS, V3CenterFilter } from "../src/lib/dashboard-v3/types";

type SourceType = "total" | "visit" | "survey" | "coupon" | "waiting";

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function centerArg(): V3CenterFilter {
  const value = arg("center");
  if (!value || value === "ALL") return "ALL";
  const code = Number(value);
  if (V3_CENTERS.some((center) => center.code === code)) return code as V3CenterFilter;
  throw new Error("--center 값은 ALL, 2, 3, 4 중 하나여야 합니다.");
}

function sourceTypesArg(): SourceType[] | undefined {
  const value = arg("source") || arg("sources");
  if (!value) return undefined;
  const allowed = new Set(["total", "visit", "survey", "coupon", "waiting"]);
  const sources = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const source of sources) {
    if (!allowed.has(source)) throw new Error("--source 값은 total, visit, survey, coupon, waiting 중 하나 이상이어야 합니다.");
  }
  return sources as SourceType[];
}

async function main() {
  const startDate = arg("start") || new Date().toISOString().slice(0, 10);
  const endDate = arg("end") || startDate;

  const result = await syncDashboardV3Range({
    startDate,
    endDate,
    center: centerArg(),
    triggeredBy: "script",
    sourceTypes: sourceTypesArg(),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
