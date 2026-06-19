import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const checkedDirs = [
  "src/app/dashboard-v2",
  "src/app/api/v2",
  "src/lib/dashboard-v2",
];

const allowedFiles = new Set([
  "src/lib/dashboard-v2/db.ts",
]);

const forbiddenPatterns = [
  { pattern: /@\/lib\/prisma|from ["'].*\/lib\/prisma["']/, label: "v1 prisma import" },
  { pattern: /\bprisma\./, label: "direct prisma usage" },
  { pattern: /process\.env\.DATABASE_URL/, label: "v1 DATABASE_URL usage" },
];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) entries.push(path);
  }
  return entries;
}

const violations = [];

for (const dir of checkedDirs) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file);
    if (allowedFiles.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(source)) {
        violations.push(`${rel}: ${rule.label}`);
      }
    }
  }
}

const envExample = readFileSync(join(root, ".env.example"), "utf8");
if (!/^V2_DATABASE_URL=/m.test(envExample)) {
  violations.push(".env.example: missing V2_DATABASE_URL");
}

if (violations.length > 0) {
  console.error("v2 DB isolation check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("v2 DB isolation check passed.");
