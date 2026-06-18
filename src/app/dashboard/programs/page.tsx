"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];

interface ProgramData {
  total: number;
  byProgram: { name: string; count: number }[];
  byCenter: { center: string; count: number }[];
  byMonth: { month: string; count: number }[];
  byDay: { date: string; count: number }[];
}

export default function ProgramsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const [center, setCenter] = useState("ALL");
  const [data, setData] = useState<ProgramData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year) });
    if (month) params.set("month", String(month));
    if (center !== "ALL") params.set("center", center);
    fetch(`/api/dashboard/programs?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, month, center]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">프로그램 이용내역</h2>
        <p className="text-sm text-gray-500 mt-0.5">센터별 프로그램 체험 이용 현황 분석</p>
      </div>

      {/* 필터 */}
      <div className="flex gap-3 items-center">
        <div>
          <label className="block text-xs text-gray-500 mb-1">연도</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white">
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">월</label>
          <select value={month ?? ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white">
            <option value="">전체</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">센터</label>
          <select value={center} onChange={(e) => setCenter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white">
            <option value="ALL">전체 센터</option>
            <option value="강동센터">강동센터</option>
            <option value="도봉센터">도봉센터</option>
            <option value="동대문센터">동대문센터</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
      ) : !data || data.total === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-sm text-gray-400">
          데이터가 없습니다. 프로그램 이용내역 파일을 업로드해주세요.
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">총 이용 건수</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{data.total.toLocaleString()}건</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">프로그램 종류</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{data.byProgram.length}종</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">최다 이용 프로그램</p>
              <p className="text-base font-semibold text-gray-800 mt-1 truncate">
                {data.byProgram[0]?.name ?? "—"}
              </p>
              <p className="text-xs text-gray-400">{data.byProgram[0]?.count.toLocaleString()}건</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 프로그램별 이용 건수 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 lg:col-span-2">
              <h3 className="text-sm font-medium text-gray-700 mb-4">프로그램별 이용 건수 TOP 20</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.byProgram} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} name="이용 건수">
                    {data.byProgram.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 센터별 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">센터별 이용 건수</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.byCenter} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="center" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="이용 건수" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 월별 추이 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">월별 이용 추이</h3>
              {data.byMonth.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byMonth} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                    <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} name="이용 건수" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
