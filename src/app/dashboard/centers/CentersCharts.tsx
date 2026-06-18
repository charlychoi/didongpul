"use client";

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

interface MonthlyRow {
  year: number;
  month: number;
  center: string;
  visitCount: number;
  uniqueVisitorCount: number;
  avgStayMinutes: number | null;
  avgVisitsPerVisitor: number | null;
}

const CENTER_COLORS: Record<string, string> = {
  강동센터: "#3b82f6",
  도봉센터: "#10b981",
  동대문센터: "#f59e0b",
};

export default function CentersCharts({
  monthly,
  centers,
}: {
  monthly: MonthlyRow[];
  centers: string[];
}) {
  // Monthly visit count by center
  const monthMap = new Map<string, Record<string, number>>();
  for (const r of monthly) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    if (!monthMap.has(key)) monthMap.set(key, {});
    monthMap.get(key)![r.center] = (monthMap.get(key)![r.center] ?? 0) + r.visitCount;
  }
  const monthData = Array.from(monthMap.entries())
    .sort()
    .map(([key, cs]) => ({ month: key.slice(5), ...cs }));

  // Radar data per center (normalized)
  const agg: Record<
    string,
    { visits: number; unique: number; stay: number[]; freq: number[]; edu: number }
  > = {};
  for (const c of centers) agg[c] = { visits: 0, unique: 0, stay: [], freq: [], edu: 0 };
  for (const r of monthly) {
    const a = agg[r.center];
    if (!a) continue;
    a.visits += r.visitCount;
    a.unique += r.uniqueVisitorCount;
    if (r.avgStayMinutes) a.stay.push(r.avgStayMinutes);
    if (r.avgVisitsPerVisitor) a.freq.push(r.avgVisitsPerVisitor);
  }
  const maxVisits = Math.max(...Object.values(agg).map((a) => a.visits)) || 1;
  const maxUnique = Math.max(...Object.values(agg).map((a) => a.unique)) || 1;

  const radarData = [
    { metric: "방문건수", ...Object.fromEntries(centers.map((c) => [c, Math.round((agg[c].visits / maxVisits) * 100)])) },
    { metric: "고유방문자", ...Object.fromEntries(centers.map((c) => [c, Math.round((agg[c].unique / maxUnique) * 100)])) },
    {
      metric: "평균체류",
      ...Object.fromEntries(
        centers.map((c) => {
          const avg = agg[c].stay.length > 0 ? agg[c].stay.reduce((a, b) => a + b, 0) / agg[c].stay.length : 0;
          return [c, Math.min(100, Math.round((avg / 240) * 100))];
        })
      ),
    },
    {
      metric: "방문빈도",
      ...Object.fromEntries(
        centers.map((c) => {
          const avg = agg[c].freq.length > 0 ? agg[c].freq.reduce((a, b) => a + b, 0) / agg[c].freq.length : 0;
          return [c, Math.min(100, Math.round((avg / 10) * 100))];
        })
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">월별 방문건수 비교</h3>
        {monthData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {centers.map((c) => (
                <Bar key={c} dataKey={c} fill={CENTER_COLORS[c] ?? "#6b7280"} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">센터 운영 지표 비교 (100점 기준)</h3>
        {radarData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              {centers.map((c) => (
                <Radar
                  key={c}
                  name={c}
                  dataKey={c}
                  stroke={CENTER_COLORS[c] ?? "#6b7280"}
                  fill={CENTER_COLORS[c] ?? "#6b7280"}
                  fillOpacity={0.15}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
