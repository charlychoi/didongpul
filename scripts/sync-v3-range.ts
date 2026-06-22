import { syncDashboardV3Range } from "../src/lib/dashboard-v3/warehouse";
import { V3_CENTERS, V3CenterFilter } from "../src/lib/dashboard-v3/types";

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

async function main() {
  const startDate = arg("start") || new Date().toISOString().slice(0, 10);
  const endDate = arg("end") || startDate;

  const result = await syncDashboardV3Range({
    startDate,
    endDate,
    center: centerArg(),
    triggeredBy: "script",
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
