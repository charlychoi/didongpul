import { buildDashboardV3 } from "../src/lib/dashboard-v3/aggregator";
import type { V3SourceBundle } from "../src/lib/dashboard-v3/types";

const source: V3SourceBundle = {
  totals: {
    total: 6,
    data: [
      {
        center_type: 2,
        name: "테스트1",
        contact: "010-0000-0001",
        entered_at: "2026-06-01 10:00:00",
        leaved_at: "2026-06-01 11:00:00",
        count_visit: "5회 이상",
      },
      {
        center_type: 2,
        name: "테스트1",
        contact: "010-0000-0001",
        entered_at: "2026-06-01 14:00:00",
        leaved_at: "2026-06-01 15:00:00",
        count_visit: "5회 이상",
      },
      {
        center_type: 2,
        name: "테스트1",
        contact: "010-0000-0001",
        entered_at: "2026-06-02 10:00:00",
        leaved_at: "2026-06-02 11:00:00",
        count_visit: "5회 이상",
      },
      {
        center_type: 3,
        name: "테스트1",
        contact: "010-0000-0001",
        entered_at: "2026-06-02 13:00:00",
        leaved_at: "2026-06-02 14:00:00",
        count_visit: "5회 이상",
      },
      {
        center_type: 2,
        name: "테스트2",
        contact: "010-0000-0002",
        entered_at: "2026-06-01 10:00:00",
        leaved_at: "2026-06-01 11:00:00",
        count_visit: "첫 방문",
      },
      {
        center_type: 2,
        name: "테스트3",
        contact: "010-0000-0003",
        entered_at: "2026-06-01 12:00:00",
        leaved_at: "2026-06-01 13:00:00",
        count_visit: "",
      },
    ],
  },
  visits: {
    total: 6,
    centerTotals: {
      "강동센터": 5,
      "도봉센터": 1,
    },
    data: [
      {
        id: 1,
        user: { id: "u1", name: "테스트1", contact: "010-0000-0001" },
        center_type: 2,
        entered_at: "2026-06-01 10:00:00",
        leaved_at: "2026-06-01 11:00:00",
      },
      {
        id: 2,
        user: { id: "u1", name: "테스트1", contact: "010-0000-0001" },
        center_type: 2,
        entered_at: "2026-06-01 14:00:00",
        leaved_at: "2026-06-01 15:00:00",
      },
      {
        id: 3,
        user: { id: "u1", name: "테스트1", contact: "010-0000-0001" },
        center_type: 2,
        entered_at: "2026-06-02 10:00:00",
        leaved_at: "2026-06-02 11:00:00",
      },
      {
        id: 4,
        user: { id: "u1", name: "테스트1", contact: "010-0000-0001" },
        center_type: 3,
        entered_at: "2026-06-02 13:00:00",
        leaved_at: "2026-06-02 14:00:00",
      },
      {
        id: 5,
        user: { id: "u2", name: "테스트2", contact: "010-0000-0002" },
        center_type: 2,
        entered_at: "2026-06-01 10:00:00",
        leaved_at: "2026-06-01 11:00:00",
      },
      {
        id: 6,
        user: { id: "u3", name: "테스트3", contact: "010-0000-0003" },
        center_type: 2,
        entered_at: "2026-06-01 12:00:00",
        leaved_at: "2026-06-01 13:00:00",
      },
    ],
  },
  waitings: { data: [], total: 0 },
  surveys: { data: [], total: 0 },
  coupons: { data: [], total: 0 },
  websiteVisitors: { data: [], total: 0 },
  websiteStats: { data: [], total: 0 },
  fetchedAt: new Date().toISOString(),
};

const result = buildDashboardV3(
  { startDate: "2026-06-01", endDate: "2026-06-02", center: "ALL" },
  source
);

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(result.kpis.uniqueUsers, 3, "uniqueUsers");
assertEqual(result.kpis.totalVisits, 5, "totalVisits");
assertEqual(result.kpis.dedupedVisits, 5, "dedupedVisits");
assertEqual(result.kpis.newUsers, 1, "newUsers");
assertEqual(result.kpis.revisitUsers, 4, "revisitUsers");
assertEqual(result.kpis.revisitRate, 80, "revisitRate");
assertEqual(
  result.charts.visitCountDistribution.some((item) => item.name === "횟수 미상" && item.value === 1),
  true,
  "unknown visit count bucket"
);

const gangdongVisits = result.centers.find((center) => center.center === "강동센터")?.visits;
const dobongVisits = result.centers.find((center) => center.center === "도봉센터")?.visits;
assertEqual(gangdongVisits, 4, "gangdong center visits");
assertEqual(dobongVisits, 1, "dobong center visits");

console.log("v3 revisit logic check passed.");
