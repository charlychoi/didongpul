"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#10b981", "#ef4444", "#9ca3af"];

export default function EducationCharts({
  byCenter,
  byMonth,
  topPrograms,
  distribution,
}: {
  byCenter: { center: string; count: number }[];
  byMonth: { month: string; count: number }[];
  topPrograms: { name: string; count: number }[];
  distribution: { status: string; count: number }[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">센터별 교육 참석 인원</h3>
        {byCenter.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byCenter} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="center" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} name="참석 인원" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">참석/불참 분포</h3>
        {distribution.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={distribution}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {distribution.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">월별 교육 참석 추이</h3>
        {byMonth.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byMonth} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="참석 인원" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">인기 교육 프로그램 TOP 10</h3>
        {topPrograms.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <div className="space-y-2">
            {topPrograms.map((p, i) => {
              const maxCount = topPrograms[0].count;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-gray-400 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-700 truncate">{p.name}</span>
                      <span className="text-xs font-medium text-gray-900 ml-2 shrink-0">
                        {p.count}명
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${(p.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
