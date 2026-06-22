"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];

interface SurveyData {
  total: number;
  byCenter: { center: string; count: number }[];
  byGender: { gender: string; count: number }[];
  byAge: { age: string; count: number }[];
  byHowFound: { label: string; count: number }[];
  byVisitCount: { label: string; count: number }[];
  byWillReturn: { label: string; count: number }[];
  byFavorite: { name: string; count: number }[];
  byMonth: { month: string; count: number }[];
  satisfaction: { program: number | null; operation: number | null; digitalHelp: number | null };
}

function ScoreBar({ score, label }: { score: number | null; label: string }) {
  const pct = score ? ((score - 1) / 4) * 100 : 0;
  const color = score && score >= 4 ? "#10b981" : score && score >= 3 ? "#f59e0b" : "#ef4444";
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{score ? score.toFixed(2) : "—"} / 5.00</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function SurveysPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const [center, setCenter] = useState("ALL");
  const [data, setData] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ year: String(year) });
    if (month) params.set("month", String(month));
    if (center !== "ALL") params.set("center", center);
    fetch(`/api/dashboard/surveys?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, month, center]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">설문조사 내역</h2>
        <p className="text-sm text-gray-500 mt-0.5">방문자 만족도 및 설문조사 응답 분석</p>
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
          데이터가 없습니다. 설문조사 내역 파일을 업로드해주세요.
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">총 응답 수</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{data.total.toLocaleString()}건</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">프로그램 만족도</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {data.satisfaction.program?.toFixed(2) ?? "—"}
                <span className="text-sm text-gray-400 font-normal"> / 5</span>
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">운영 만족도</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {data.satisfaction.operation?.toFixed(2) ?? "—"}
                <span className="text-sm text-gray-400 font-normal"> / 5</span>
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">디지털 도움 만족도</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {data.satisfaction.digitalHelp?.toFixed(2) ?? "—"}
                <span className="text-sm text-gray-400 font-normal"> / 5</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 만족도 상세 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">만족도 점수 (5점 만점)</h3>
              <div className="space-y-4 mt-2">
                <ScoreBar score={data.satisfaction.program} label="프로그램 만족도" />
                <ScoreBar score={data.satisfaction.operation} label="운영 만족도" />
                <ScoreBar score={data.satisfaction.digitalHelp} label="디지털기기 사용 도움" />
              </div>
            </div>

            {/* 성별 분포 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">성별 분포</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.byGender.map((r) => ({ name: r.gender === "FEMALE" ? "여성" : r.gender === "MALE" ? "남성" : r.gender, value: r.count }))}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {data.byGender.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 연령대 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">연령대 분포</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.byAge} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="age" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="응답 수" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 알게된 경로 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">알게된 경로</h3>
              <div className="space-y-2">
                {data.byHowFound.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-700 truncate">{r.label}</span>
                        <span className="font-medium text-gray-900 ml-2 shrink-0">{r.count}명</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full"
                          style={{ width: `${(r.count / data.byHowFound[0].count) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 재방문 의향 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">재방문 의향</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.byWillReturn.map((r) => ({ name: r.label, value: r.count }))}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {data.byWillReturn.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 흥미로운 프로그램 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">가장 흥미로웠던 프로그램 TOP 10</h3>
              {data.byFavorite.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
              ) : (
                <div className="space-y-2">
                  {data.byFavorite.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-xs text-gray-400 text-right shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-700 truncate">{r.name}</span>
                          <span className="font-medium text-gray-900 ml-2 shrink-0">{r.count}명</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full"
                            style={{ width: `${(r.count / data.byFavorite[0].count) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 방문 횟수 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">방문 횟수 분포</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.byVisitCount} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} name="응답 수" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 월별 응답 추이 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">월별 응답 추이</h3>
              {data.byMonth.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byMonth} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="응답 수" />
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
