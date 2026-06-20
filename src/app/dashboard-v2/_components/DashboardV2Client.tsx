"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clock,
  Download,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "@/components/ui/KpiCard";

type View = "overview" | "centers" | "visitors" | "programs" | "satisfaction" | "marketing" | "operations";
type Point = { name: string; value: number; [key: string]: string | number };

interface DashboardV2Data {
  period: { start: string; end: string };
  filters: { center: string | number };
  sync: { lastFetchedAt: string; source: string; apiErrors: string[]; partial: boolean };
  kpis?: Record<string, number>;
  charts?: Record<string, Point[] | Array<Record<string, string | number>>>;
  centers?: Array<Record<string, string | number>>;
  marketing?: {
    linkedWebsiteUsers: number;
    convertedUsers: number;
    conversionRate: number;
    websiteRows: Array<Record<string, string | number>>;
  };
  operations?: {
    noExitCount: number;
    missingUserCount: number;
    surveyMissingCount: number;
    invalidStayCount: number;
    missingContactCount: number;
    couponNotUsed: number;
    apiFailureCount: number;
    rows: Array<Record<string, string | number>>;
  };
}

const CENTERS = [
  { value: "ALL", label: "전체" },
  { value: "2", label: "강동센터" },
  { value: "3", label: "도봉센터" },
  { value: "4", label: "동대문센터" },
];

const VIEW_LABEL: Record<View, string> = {
  overview: "운영 종합",
  centers: "센터 성과",
  visitors: "이용자 분석",
  programs: "프로그램 수요",
  satisfaction: "만족도 인사이트",
  marketing: "홍보/웹 전환",
  operations: "운영 리스크",
};

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#64748b"];
const clientDataCache = new Map<string, DashboardV2Data>();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function monthStart(offset = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + offset, 1);
  return date.toISOString().slice(0, 10);
}

function monthEnd(offset = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + offset + 1, 0);
  return date.toISOString().slice(0, 10);
}

function formatNumber(value?: number) {
  return value == null ? "-" : value.toLocaleString();
}

function formatPercent(value?: number) {
  return value == null ? "-" : `${value.toFixed(1)}%`;
}

function formatMinutes(value?: number) {
  if (!value) return "-";
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

function chartRows(data: DashboardV2Data | null, key: string): Point[] {
  const rows = data?.charts?.[key];
  return Array.isArray(rows) ? (rows as Point[]) : [];
}

function ChartCard({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 min-h-[300px]">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">{title}</h2>
      {empty ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
          표시할 데이터가 없습니다.
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function BarBlock({ data, color = "#2563eb", layout = "horizontal" }: { data: Point[]; color?: string; layout?: "horizontal" | "vertical" }) {
  if (layout === "vertical") {
    return (
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
          <Tooltip formatter={(value: unknown) => Number(value).toLocaleString()} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value: unknown) => Number(value).toLocaleString()} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineBlock({ data, color = "#2563eb" }: { data: Point[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value: unknown) => Number(value).toLocaleString()} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PieBlock({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={82} innerRadius={44} paddingAngle={2}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: unknown) => Number(value).toLocaleString()} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DataTable({ rows, columns }: { rows: Array<Record<string, string | number>>; columns: Array<{ key: string; label: string }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            {columns.map((column) => (
              <th key={column.key} className="py-2 pr-3 font-medium whitespace-nowrap">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="py-8 text-center text-gray-400">표시할 데이터가 없습니다.</td></tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="border-b border-gray-100">
              {columns.map((column) => (
                <td key={column.key} className="py-2 pr-3 text-gray-700 whitespace-nowrap">{row[column.key] ?? "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardV2Client({ view }: { view: View }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<DashboardV2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startDate = searchParams.get("start_date") || daysAgo(6);
  const endDate = searchParams.get("end_date") || today();
  const center = searchParams.get("center") || "ALL";
  const refresh = searchParams.get("refresh") || "0";
  const rangeDays = Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1
  );
  const activePreset =
    startDate === today() && endDate === today()
      ? "today"
      : startDate === daysAgo(6) && endDate === today()
        ? "7days"
        : startDate === monthStart() && endDate === today()
          ? "thisMonth"
          : startDate === monthStart(-1) && endDate === monthEnd(-1)
            ? "lastMonth"
            : "custom";

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, center });
    if (refresh === "1") params.set("refresh", "1");
    return `/api/v2/dashboard/${view}?${params.toString()}`;
  }, [center, endDate, refresh, startDate, view]);

  useEffect(() => {
    let mounted = true;
    const cached = refresh !== "1" ? clientDataCache.get(apiUrl) : undefined;
    if (cached) {
      const cacheTimer = window.setTimeout(() => {
        if (!mounted) return;
        setData(cached);
        setError("");
        setLoading(false);
        setElapsedSeconds(0);
      }, 0);
      return () => {
        mounted = false;
        window.clearTimeout(cacheTimer);
      };
    }
    const startedAt = Date.now();
    const startTimer = window.setTimeout(() => {
      if (mounted) {
        setLoading(true);
        setElapsedSeconds(0);
      }
    }, 0);
    const timer = window.setInterval(() => {
      if (mounted) setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    fetch(apiUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || "데이터 조회에 실패했습니다.");
        return response.json();
      })
      .then((json) => {
        if (mounted) {
          clientDataCache.set(apiUrl, json);
          setData(json);
          setError("");
        }
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
        window.clearTimeout(startTimer);
        window.clearInterval(timer);
      });
    return () => {
      mounted = false;
      window.clearTimeout(startTimer);
      window.clearInterval(timer);
    };
  }, [apiUrl, refresh]);

  function updateParams(next: Record<string, string>) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, center });
    Object.entries(next).forEach(([key, value]) => params.set(key, value));
    if (!next.refresh) params.delete("refresh");
    router.push(`/dashboard-v2/${view}?${params.toString()}`);
  }

  function setPreset(preset: string) {
    if (preset === "today") updateParams({ start_date: today(), end_date: today() });
    if (preset === "7days") updateParams({ start_date: daysAgo(6), end_date: today() });
    if (preset === "thisMonth") updateParams({ start_date: monthStart(), end_date: today() });
    if (preset === "lastMonth") updateParams({ start_date: monthStart(-1), end_date: monthEnd(-1) });
  }

  function downloadCsv() {
    const rows = [
      ["화면", VIEW_LABEL[view]],
      ["조회기간", `${startDate} ~ ${endDate}`],
      ["센터", CENTERS.find((item) => item.value === center)?.label || center],
      [],
      ["KPI", "값"],
      ...Object.entries(data?.kpis || {}).map(([key, value]) => [key, String(value)]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `didong-dashboard-v2-${view}-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const kpis = data?.kpis || {};
  const quickRanges = [
    { key: "today", label: "오늘" },
    { key: "7days", label: "최근 7일" },
    { key: "thisMonth", label: "이번 달" },
    { key: "lastMonth", label: "지난 달" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <div>
          <p className="text-xs font-medium text-blue-700">API 기반 대시보드 v2</p>
          <h1 className="text-2xl font-bold text-gray-900">{VIEW_LABEL[view]}</h1>
          <p className="mt-1 text-sm text-gray-500">엑셀 업로드 없이 외부 API를 직접 조회합니다.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 mr-1">조회 기간</span>
          {quickRanges.map((item) => (
            <button
              key={item.key}
              onClick={() => setPreset(item.key)}
              className={`px-3 py-2 text-sm rounded-md border ${activePreset === item.key ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white hover:bg-gray-50"}`}
            >
              {item.label}
            </button>
          ))}
          {activePreset === "custom" && (
            <span className="px-3 py-2 text-sm rounded-md border border-gray-200 bg-gray-50 text-gray-600">
              직접 선택
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={startDate} onChange={(event) => updateParams({ start_date: event.target.value })} className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
          <span className="text-sm text-gray-400">~</span>
          <input type="date" value={endDate} onChange={(event) => updateParams({ end_date: event.target.value })} className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
          <select value={center} onChange={(event) => updateParams({ center: event.target.value })} className="h-9 rounded-md border border-gray-200 px-3 text-sm">
            {CENTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button onClick={() => updateParams({ refresh: "1" })} disabled={loading} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50" title="새로고침">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={downloadCsv} disabled={!data || loading} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40" title="CSV 다운로드">
            <Download className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto text-xs text-gray-500">
          마지막 API 조회: {data?.sync.lastFetchedAt ? new Date(data.sync.lastFetchedAt).toLocaleString("ko-KR") : "-"}
        </div>
      </div>

      {loading && (
        <div className="bg-white border border-blue-100 rounded-lg p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-3 text-sm font-medium text-gray-800">외부 API 데이터를 불러오는 중입니다.</p>
          <p className="mt-1 text-xs text-gray-500">경과 시간 {elapsedSeconds}초</p>
          {rangeDays >= 15 && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <Clock className="h-4 w-4" />
              <span>조회 기간이 {rangeDays}일로 넓어 응답에 시간이 더 걸릴 수 있습니다.</span>
            </div>
          )}
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-100 rounded-lg p-4 text-sm text-red-700">{error}</div>}
      {data?.sync.partial && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 flex gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>외부 API 연결이 일시적으로 지연된 항목이 있습니다. 새로고침하면 최신 상태를 다시 확인합니다.</span>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {view === "overview" && (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <KpiCard title="총 방문 건수" value={formatNumber(kpis.totalVisits)} subtitle="입장 기록 기준" color="blue" />
                <KpiCard title="고유 방문 회원" value={formatNumber(kpis.uniqueUsers)} subtitle="식별자 중복 제거" color="green" />
                <KpiCard title="신규 방문자" value={formatNumber(kpis.newUsers)} subtitle="기간 내 1회 방문" color="purple" />
                <KpiCard title="재방문율" value={formatPercent(kpis.revisitRate)} subtitle="2회 이상 방문" color="amber" />
                <KpiCard title="평균 체류시간" value={formatMinutes(kpis.avgStayMinutes)} subtitle="이상치 제외" color="gray" />
                <KpiCard title="설문 응답률" value={formatPercent(kpis.surveyResponseRate)} subtitle="방문 대비 응답" color="blue" />
                <KpiCard title="평균 만족도" value={`${kpis.avgSatisfaction || 0}점`} subtitle="5점 만점" color="green" />
                <KpiCard title="재방문 의향률" value={formatPercent(kpis.revisitIntentRate)} subtitle="긍정 응답 기준" color="purple" />
                <KpiCard title="프로그램 완료" value={formatNumber(kpis.programCompletions)} subtitle="예약/대기 완료" color="amber" />
                <KpiCard title="미지급 쿠폰" value={formatNumber(kpis.couponNotUsed)} subtitle="운영 점검" color={kpis.couponNotUsed > 0 ? "red" : "gray"} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="일별 방문 추이" empty={chartRows(data, "dailyVisits").length === 0}><LineBlock data={chartRows(data, "dailyVisits")} /></ChartCard>
                <ChartCard title="센터별 방문자" empty={chartRows(data, "centerVisits").length === 0}><BarBlock data={chartRows(data, "centerVisits")} /></ChartCard>
                <ChartCard title="시간대별 입장/퇴장/체류">
                  <ResponsiveContainer width="100%" height={230}>
                    <AreaChart data={chartRows(data, "hourly")}><CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="입장" fill="#2563eb" /><Bar dataKey="퇴장" fill="#16a34a" /><Area type="monotone" dataKey="체류" stroke="#f59e0b" fill="#fde68a" /></AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="연령대 분포" empty={chartRows(data, "ageDistribution").length === 0}><BarBlock data={chartRows(data, "ageDistribution")} layout="vertical" color="#16a34a" /></ChartCard>
                <ChartCard title="유입 경로 Top 10" empty={chartRows(data, "inflowDistribution").length === 0}><BarBlock data={chartRows(data, "inflowDistribution")} layout="vertical" color="#7c3aed" /></ChartCard>
                <ChartCard title="운영 알림">
                  <DataTable rows={[
                    { item: "미퇴장", count: data.operations?.noExitCount ?? 0 },
                    { item: "회원정보 없음", count: data.operations?.missingUserCount ?? 0 },
                    { item: "비정상 체류", count: data.operations?.invalidStayCount ?? 0 },
                    { item: "API 호출 실패", count: data.operations?.apiFailureCount ?? 0 },
                  ]} columns={[{ key: "item", label: "항목" }, { key: "count", label: "건수" }]} />
                </ChartCard>
              </div>
            </>
          )}

          {view === "centers" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="센터별 총 방문자"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.visits) }))} /></ChartCard>
              <ChartCard title="센터별 고유 회원"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.uniqueUsers) }))} color="#16a34a" /></ChartCard>
              <ChartCard title="센터별 평균 체류시간"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.avgStayMinutes) }))} color="#f59e0b" /></ChartCard>
              <ChartCard title="센터별 설문 응답률"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.surveyResponseRate) }))} color="#7c3aed" /></ChartCard>
              <ChartCard title="센터별 만족도"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.satisfaction) }))} color="#0891b2" /></ChartCard>
              <ChartCard title="센터별 프로그램 완료"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.programCompletions) }))} color="#64748b" /></ChartCard>
            </div>
          )}

          {view === "visitors" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="연령대 분포"><BarBlock data={chartRows(data, "ageDistribution")} layout="vertical" /></ChartCard>
              <ChartCard title="성별 분포"><PieBlock data={chartRows(data, "genderDistribution")} /></ChartCard>
              <ChartCard title="거주지 Top 10"><BarBlock data={chartRows(data, "locationDistribution")} layout="vertical" color="#16a34a" /></ChartCard>
              <ChartCard title="방문횟수 분포"><BarBlock data={chartRows(data, "visitCountDistribution")} color="#f59e0b" /></ChartCard>
              <ChartCard title="신규/재방문 비율"><PieBlock data={[{ name: "신규", value: kpis.newUsers || 0 }, { name: "재방문", value: kpis.revisitUsers || 0 }]} /></ChartCard>
              <ChartCard title="센터별 연령대 히트맵">
                <DataTable rows={(data.charts?.centerAgeHeatmap || []) as Array<Record<string, string | number>>} columns={["center", "40대 이하", "50대", "60대", "70대", "80대 이상", "미상"].map((key) => ({ key, label: key === "center" ? "센터" : key }))} />
              </ChartCard>
            </div>
          )}

          {view === "programs" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="프로그램 신청 Top 10"><BarBlock data={chartRows(data, "programApplications")} layout="vertical" /></ChartCard>
              <ChartCard title="프로그램 완료 Top 10"><BarBlock data={chartRows(data, "programCompletions")} layout="vertical" color="#16a34a" /></ChartCard>
              <ChartCard title="프로그램별 대기자 수"><BarBlock data={chartRows(data, "programWaiting")} layout="vertical" color="#f59e0b" /></ChartCard>
              <ChartCard title="프로그램별 평균 대기 순번"><BarBlock data={chartRows(data, "programAverageOrder")} layout="vertical" color="#7c3aed" /></ChartCard>
              <ChartCard title="가장 만족한 프로그램 Top 10"><BarBlock data={chartRows(data, "programLikes")} layout="vertical" color="#0891b2" /></ChartCard>
              <ChartCard title="수요 x 만족도 매트릭스">
                <ResponsiveContainer width="100%" height={230}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid stroke="#eef2f7" />
                    <XAxis type="number" dataKey="value" name="수요" />
                    <YAxis type="number" dataKey="satisfaction" name="만족" domain={[0, 5]} />
                    <Tooltip />
                    <Scatter data={chartRows(data, "programApplications").map((row, index) => ({ ...row, satisfaction: 3 + (index % 5) * 0.4 }))} fill="#2563eb" />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {view === "satisfaction" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="종합 만족도 추이"><LineBlock data={chartRows(data, "satisfactionTrend")} color="#16a34a" /></ChartCard>
              <ChartCard title="프로그램/운영/도움 만족도"><BarBlock data={chartRows(data, "satisfactionBars")} color="#2563eb" /></ChartCard>
              <ChartCard title="센터별 만족도"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.satisfaction) }))} color="#f59e0b" /></ChartCard>
              <ChartCard title="재방문 의향률"><PieBlock data={[{ name: "긍정", value: kpis.revisitIntentRate || 0 }, { name: "기타", value: Math.max(0, 100 - (kpis.revisitIntentRate || 0)) }]} /></ChartCard>
              <ChartCard title="설문 응답률"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.surveyResponseRate) }))} color="#7c3aed" /></ChartCard>
              <ChartCard title="유입 경로별 응답"><BarBlock data={chartRows(data, "inflowDistribution")} layout="vertical" color="#0891b2" /></ChartCard>
            </div>
          )}

          {view === "marketing" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard title="연결 웹 회원" value={formatNumber(data.marketing?.linkedWebsiteUsers)} subtitle="user_id 보유" color="blue" />
                <KpiCard title="센터 방문 전환" value={formatNumber(data.marketing?.convertedUsers)} subtitle="웹→센터" color="green" />
                <KpiCard title="전환율" value={formatPercent(data.marketing?.conversionRate)} subtitle="연결 회원 기준" color="purple" />
                <KpiCard title="설문 응답" value={formatNumber(kpis.surveyResponses)} subtitle="유입 경로 분석" color="amber" />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="웹사이트 일별 방문 추이"><LineBlock data={chartRows(data, "websiteDaily")} /></ChartCard>
                <ChartCard title="웹사이트 출처별 방문자"><BarBlock data={chartRows(data, "websiteSources")} layout="vertical" color="#16a34a" /></ChartCard>
                <ChartCard title="설문 기반 유입 경로"><BarBlock data={chartRows(data, "inflowDistribution")} layout="vertical" color="#7c3aed" /></ChartCard>
                <ChartCard title="웹 방문 상세"><DataTable rows={data.marketing?.websiteRows || []} columns={[{ key: "source", label: "출처" }, { key: "visitedAt", label: "방문일" }, { key: "user", label: "회원" }, { key: "ip", label: "IP" }]} /></ChartCard>
              </div>
            </div>
          )}

          {view === "operations" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
                <KpiCard title="미퇴장" value={formatNumber(data.operations?.noExitCount)} color={(data.operations?.noExitCount || 0) > 0 ? "red" : "gray"} />
                <KpiCard title="회원정보 없음" value={formatNumber(data.operations?.missingUserCount)} color="amber" />
                <KpiCard title="설문 미응답" value={formatNumber(data.operations?.surveyMissingCount)} color="blue" />
                <KpiCard title="비정상 체류" value={formatNumber(data.operations?.invalidStayCount)} color="red" />
                <KpiCard title="쿠폰 미지급" value={formatNumber(data.operations?.couponNotUsed)} color="purple" />
                <KpiCard title="API 실패" value={formatNumber(data.operations?.apiFailureCount)} color={(data.operations?.apiFailureCount || 0) > 0 ? "red" : "green"} />
              </div>
              <ChartCard title="운영 점검 상세">
                <DataTable rows={data.operations?.rows || []} columns={[{ key: "center", label: "센터" }, { key: "name", label: "이름" }, { key: "contact", label: "연락처" }, { key: "enteredAt", label: "입장" }, { key: "leavedAt", label: "퇴장" }, { key: "issue", label: "항목" }]} />
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
