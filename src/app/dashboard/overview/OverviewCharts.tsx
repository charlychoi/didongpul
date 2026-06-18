"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface DailyRow {
  date: string;
  center: string;
  visitCount: number;
  uniqueVisitorCount: number;
  avgStayMinutes: number | null;
}

interface MonthlyRow {
  year: number;
  month: number;
  center: string;
  visitCount: number;
  uniqueVisitorCount: number;
  avgStayMinutes: number | null;
}

const CENTER_COLORS: Record<string, string> = {
  강동센터: "#3b82f6",
  도봉센터: "#10b981",
  동대문센터: "#f59e0b",
};

export default function OverviewCharts({
  daily,
  monthly,
  byCenterVisits,
}: {
  daily: DailyRow[];
  monthly: MonthlyRow[];
  byCenterVisits: Record<string, number>;
  year: number;
  month: number | null;
}) {
  // Daily trend grouped by date
  const dateMap = new Map<string, Record<string, number>>();
  for (const d of daily) {
    if (!dateMap.has(d.date)) dateMap.set(d.date, {});
    dateMap.get(d.date)![d.center] = (dateMap.get(d.date)![d.center] ?? 0) + d.visitCount;
  }
  const dailyData = Array.from(dateMap.entries()).map(([date, centers]) => ({
    date: date.slice(5), // MM-DD
    ...centers,
  }));

  // Center comparison bar
  const centerData = Object.entries(byCenterVisits).map(([center, count]) => ({
    center,
    방문건수: count,
  }));

  // Monthly trend by center
  const monthMap = new Map<string, Record<string, number>>();
  for (const r of monthly) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    if (!monthMap.has(key)) monthMap.set(key, {});
    monthMap.get(key)![r.center] = (monthMap.get(key)![r.center] ?? 0) + r.visitCount;
  }
  const monthlyData = Array.from(monthMap.entries())
    .sort()
    .map(([key, centers]) => ({ month: key, ...centers }));

  const centers = Object.keys(byCenterVisits);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">센터별 방문건수 비교</h3>
        {centerData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={centerData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="center" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Bar dataKey="방문건수" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">월별 방문 추이</h3>
        {monthlyData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {centers.map((c) => (
                <Line
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stroke={CENTER_COLORS[c] ?? "#6b7280"}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 lg:col-span-2">
        <h3 className="text-sm font-medium text-gray-700 mb-4">일별 방문 추이</h3>
        {dailyData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음 — Excel 파일을 업로드해주세요</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {centers.map((c) => (
                <Line
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stroke={CENTER_COLORS[c] ?? "#6b7280"}
                  strokeWidth={1.5}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
