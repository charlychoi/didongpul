import { buildDashboardV2 } from "../src/lib/dashboard-v2/aggregator";
import type { V2SourceBundle } from "../src/lib/dashboard-v2/types";

const source: V2SourceBundle = {
  totals: {
    total: 5,
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
    ],
  },
  visits: {
    total: 5,
    centerTotals: {
      "강동센터": 4,
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
    ],
  },
  waitings: { data: [], total: 0 },
  surveys: { data: [], total: 0 },
  coupons: { data: [], total: 0 },
  websiteVisitors: { data: [], total: 0 },
  websiteStats: { data: [], total: 0 },
  fetchedAt: new Date().toISOString(),
};

const result = buildDashboardV2(
  { startDate: "2026-06-01", endDate: "2026-06-02", center: "ALL" },
  source
);

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(result.kpis.uniqueUsers, 2, "uniqueUsers");
assertEqual(result.kpis.totalVisits, 4, "totalVisits");
assertEqual(result.kpis.dedupedVisits, 4, "dedupedVisits");
assertEqual(result.kpis.newUsers, 1, "newUsers");
assertEqual(result.kpis.revisitUsers, 3, "revisitUsers");
assertEqual(result.kpis.revisitRate, 75, "revisitRate");

const gangdongVisits = result.centers.find((center) => center.center === "강동센터")?.visits;
const dobongVisits = result.centers.find((center) => center.center === "도봉센터")?.visits;
assertEqual(gangdongVisits, 3, "gangdong center visits");
assertEqual(dobongVisits, 1, "dobong center visits");

console.log("v2 revisit logic check passed.");
