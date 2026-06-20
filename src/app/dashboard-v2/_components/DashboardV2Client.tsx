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

type View = "overview" | "centers" | "visitors" | "members" | "demographics" | "programs" | "program-satisfaction" | "satisfaction" | "coupons" | "operations" | "raw-data";
type Point = { name: string; value: number; [key: string]: string | number };

interface DashboardV2Data {
  period: { start: string; end: string };
  filters: { center: string | number };
  sync: { lastFetchedAt: string; source: string; apiErrors: string[]; partial: boolean };
  kpis?: Record<string, number>;
  charts?: Record<string, Point[] | Array<Record<string, string | number>>>;
  centers?: Array<Record<string, string | number>>;
  programs?: {
    total: number;
    typeCount: number;
    topName: string;
    topCount: number;
  };
  survey?: {
    total: number;
    satisfaction: {
      program: number;
      operation: number;
      digitalHelp: number;
    };
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
  coupons?: {
    total: number;
    given: number;
    notUsed: number;
    rows: Array<Record<string, string | number>>;
  };
  rawData?: {
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
  members: "회원·재방문",
  demographics: "이용자 특성",
  programs: "프로그램 수요",
  "program-satisfaction": "프로그램 만족도",
  satisfaction: "설문 만족도",
  coupons: "쿠폰 운영",
  operations: "운영 리스크",
  "raw-data": "원천 데이터",
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

function formatNumber(value?: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : "-";
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : value;
  }
  return "-";
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

function maxPoint(rows: Point[], field: string = "value") {
  return rows.reduce<Point | null>((best, row) => {
    const value = Number(row[field]) || 0;
    const bestValue = best ? Number(best[field]) || 0 : -Infinity;
    return value > bestValue ? row : best;
  }, null);
}

function minPositivePoint(rows: Point[], field: string = "value") {
  return rows.reduce<Point | null>((best, row) => {
    const value = Number(row[field]) || 0;
    if (value <= 0) return best;
    const bestValue = best ? Number(best[field]) || 0 : Infinity;
    return value < bestValue ? row : best;
  }, null);
}

function InsightQuote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="border-l-4 border-gray-300 pl-4 text-sm font-medium text-gray-900">
        {children}
      </div>
    </div>
  );
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
    const chartHeight = Math.max(260, data.length * 30 + 40);
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 24, left: 24, bottom: 5 }} barCategoryGap={8}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            width={138}
            interval={0}
            tickFormatter={(value) => {
              const text = String(value);
              return text.length > 12 ? `${text.slice(0, 11)}...` : text;
            }}
          />
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

function ScoreBar({ label, score }: { label: string; score?: number }) {
  const value = score || 0;
  const width = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{value ? value.toFixed(2) : "-"} / 5.00</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function RankingList({ data, unit = "명", color = "#10b981" }: { data: Point[]; unit?: string; color?: string }) {
  const max = Math.max(1, ...data.map((row) => Number(row.value) || 0));
  return (
    <div className="space-y-2">
      {data.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">표시할 데이터가 없습니다.</div>
      ) : data.map((row, index) => {
        const value = Number(row.value) || 0;
        return (
          <div key={`${row.name}-${index}`} className="flex items-center gap-2">
            <span className="w-5 text-xs text-gray-400 text-right shrink-0">{index + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-xs mb-0.5 gap-3">
                <span className="text-gray-700 truncate">{row.name}</span>
                <span className="font-medium text-gray-900 shrink-0">{value.toLocaleString()}{unit}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
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

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadRowsCsv(
  rows: Array<Record<string, string | number>>,
  columns: Array<{ key: string; label: string }>,
  filename: string
) {
  const csvRows = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => row[column.key] ?? "")),
  ];
  const csv = csvRows.map((row) => row.map(csvValue).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DownloadOnlyCard({
  title,
  rows,
  columns,
  filename,
}: {
  title: string;
  rows: Array<Record<string, string | number>>;
  columns: Array<{ key: string; label: string }>;
  filename: string;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <p className="mt-1 text-xs text-gray-500">
            목록 데이터는 화면에 길게 표시하지 않고 다운로드 파일로 제공합니다.
          </p>
        </div>
        <button
          onClick={() => downloadRowsCsv(rows, columns, filename)}
          disabled={rows.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          엑셀 다운로드
        </button>
      </div>
      <div className="mt-4 rounded-md bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600">
        다운로드 가능 행 수: {rows.length.toLocaleString()}건
      </div>
    </section>
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

  const kpis = data?.kpis || {};
  const busiestCenter = maxPoint(chartRows(data, "centerVisits"));
  const topEntryHour = maxPoint(chartRows(data, "hourly"), "입장");
  const topLeaveHour = maxPoint(chartRows(data, "hourly"), "퇴장");
  const topOccupancyHour = maxPoint(chartRows(data, "hourly"), "체류");
  const lowOccupancyHour = minPositivePoint(chartRows(data, "hourly"), "체류");
  const hourlyPeakSummary = [
    { name: "입장 피크", value: Number(topEntryHour?.["입장"]) || 0, detail: topEntryHour?.name || "-" },
    { name: "퇴장 피크", value: Number(topLeaveHour?.["퇴장"]) || 0, detail: topLeaveHour?.name || "-" },
    { name: "체류 피크", value: Number(topOccupancyHour?.["체류"]) || 0, detail: topOccupancyHour?.name || "-" },
    { name: "저활용", value: Number(lowOccupancyHour?.["체류"]) || 0, detail: lowOccupancyHour?.name || "-" },
  ];
  const longestStayCenter = maxPoint(
    (data?.centers || []).map((row) => ({
      name: String(row.center),
      value: Number(row.avgStayMinutes) || 0,
    }))
  );
  const stayMinutesSummary = [
    { name: "전체 평균", value: Number(kpis.avgStayMinutes) || 0 },
    { name: longestStayCenter?.name || "최장 체류 센터", value: Number(longestStayCenter?.value) || 0 },
  ];
  const stayRateSummary = [
    { name: "30분 이하", value: Number(kpis.shortStayRate) || 0 },
    { name: "2시간 이상", value: Number(kpis.longStay2hRate) || 0 },
  ];
  const topUniqueUserCenter = maxPoint(
    (data?.centers || []).map((row) => ({
      name: String(row.center),
      value: Number(row.uniqueUsers) || 0,
    }))
  );
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
        </div>
        <div className="ml-auto text-xs text-gray-500">
          마지막 API 조회: {data?.sync.lastFetchedAt ? new Date(data.sync.lastFetchedAt).toLocaleString("ko-KR") : "-"}
        </div>
        {(loading || !data) && (
          <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
            선택한 기간과 센터의 데이터량에 따라 조회 시간이 길어질 수 있습니다. 최초 조회 후에는 v2 캐시를 재사용합니다.
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-white border border-blue-100 rounded-lg p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-3 text-sm font-medium text-gray-800">외부 API 데이터를 불러오는 중입니다.</p>
          <p className="mt-1 text-xs text-gray-500">
            조회 범위와 API 데이터량에 따라 시간이 소요될 수 있습니다. 경과 시간 {elapsedSeconds}초
          </p>
          {elapsedSeconds >= 15 && (
            <p className="mt-2 text-xs text-blue-700">
              현재 선택한 조건의 API 페이지를 순차 확인 중입니다. 첫 조회 후 동일 조건은 캐시되어 더 빠르게 열립니다.
            </p>
          )}
          {elapsedSeconds >= 45 && (
            <p className="mt-1 text-xs text-amber-700">
              외부 API 응답이 지연되고 있습니다. 잠시 기다리거나 기간/센터 범위를 줄이면 더 빠르게 확인할 수 있습니다.
            </p>
          )}
          {rangeDays >= 15 && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <Clock className="h-4 w-4" />
              <span>조회 기간이 {rangeDays}일로 넓어 여러 API 페이지를 확인하고 있습니다.</span>
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
              <InsightQuote>
                이번 기간 방문자 {formatNumber(kpis.totalVisits)}명 / 가장 방문이 많은 센터: {busiestCenter?.name || "-"}
              </InsightQuote>
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <KpiCard title="총 방문 건수" value={formatNumber(kpis.totalVisits)} subtitle="입장 기록 기준" color="blue" />
                <KpiCard title="고유 방문 회원" value={formatNumber(kpis.uniqueUsers)} subtitle="식별자 중복 제거" color="green" />
                <KpiCard title="신규 방문자" value={formatNumber(kpis.newUsers)} subtitle="기간 내 1회 방문" color="purple" />
                <KpiCard title="재방문율" value={formatPercent(kpis.revisitRate)} subtitle="2회 이상 방문" color="amber" />
                <KpiCard title="평균 체류시간" value={formatMinutes(kpis.avgStayMinutes)} subtitle="이상치 제외" color="gray" />
                <KpiCard title="설문 응답률" value={formatPercent(kpis.surveyResponseRate)} subtitle="방문 대비 응답" color="blue" />
                <KpiCard title="평균 만족도" value={`${kpis.avgSatisfaction || 0}점`} subtitle="5점 만점" color="green" />
                <KpiCard title="재방문 의향률" value={formatPercent(kpis.revisitIntentRate)} subtitle="긍정 응답 기준" color="purple" />
                <KpiCard title="프로그램 이용" value={formatNumber(kpis.programCompletions)} subtitle="API 총 이용 건수" color="amber" />
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
                <ChartCard title="평균 체류시간 통계">
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-500">평균 체류시간</p>
                      <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={stayMinutesSummary} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                          <XAxis dataKey="name" />
                          <YAxis tickFormatter={(value) => `${value}분`} />
                          <Tooltip formatter={(value: unknown) => [formatMinutes(Number(value)), "체류시간"]} />
                          <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-500">체류 유형 비율</p>
                      <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={stayRateSummary} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                          <XAxis dataKey="name" />
                          <YAxis tickFormatter={(value) => `${value}%`} />
                          <Tooltip formatter={(value: unknown) => [formatPercent(Number(value)), "비율"]} />
                          <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </ChartCard>
                <ChartCard title="시간대별 핵심 구간">
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={hourlyPeakSummary} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value: unknown, name: unknown, item: { payload?: { detail?: string } }) => [`${formatNumber(Number(value))}명`, `${String(name)} · ${item.payload?.detail || "-"}`]} />
                        <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-sm font-medium leading-6 text-gray-900">
                      {topOccupancyHour?.name
                        ? `${topOccupancyHour.name}에 체류 인원이 가장 많아, 인력 배치와 프로그램 시간표 조정에 우선 참고할 수 있습니다.`
                        : "시간대별 체류 패턴이 쌓이면 인력 배치와 프로그램 시간표 개선에 바로 활용할 수 있습니다."}
                    </p>
                  </div>
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
            <>
              <InsightQuote>
                가장 방문이 많은 센터는 {busiestCenter?.name || "-"}이고, 평균 체류시간이 가장 긴 센터는 {longestStayCenter?.name || "-"}입니다.
              </InsightQuote>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="센터별 총 방문자"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.visits) }))} /></ChartCard>
                <ChartCard title="센터별 고유 회원"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.uniqueUsers) }))} color="#16a34a" /></ChartCard>
                <ChartCard title="센터별 평균 체류시간"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.avgStayMinutes) }))} color="#f59e0b" /></ChartCard>
                <ChartCard title="센터별 설문 응답률"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.surveyResponseRate) }))} color="#7c3aed" /></ChartCard>
                <ChartCard title="센터별 만족도"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.satisfaction) }))} color="#0891b2" /></ChartCard>
                <ChartCard title="센터별 프로그램 완료"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.programCompletions) }))} color="#64748b" /></ChartCard>
              </div>
            </>
          )}

          {(view === "visitors" || view === "members") && (
            <>
              <InsightQuote>
                고유 방문 회원 {formatNumber(kpis.uniqueUsers)}명 중 재방문자는 {formatNumber(kpis.revisitUsers)}명이며, 고유 회원이 가장 많은 센터는 {topUniqueUserCenter?.name || "-"}입니다.
              </InsightQuote>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="grid grid-cols-2 gap-3 xl:col-span-2">
                  <KpiCard title="고유 방문 회원" value={formatNumber(kpis.uniqueUsers)} subtitle="식별자 중복 제거" color="green" />
                  <KpiCard title="신규 방문자" value={formatNumber(kpis.newUsers)} subtitle="기간 내 1회 방문" color="blue" />
                  <KpiCard title="재방문자" value={formatNumber(kpis.revisitUsers)} subtitle="2회 이상 방문" color="purple" />
                  <KpiCard title="재방문율" value={formatPercent(kpis.revisitRate)} subtitle="고유 회원 기준" color="amber" />
                </div>
                <ChartCard title="방문횟수 분포"><BarBlock data={chartRows(data, "visitCountDistribution")} color="#f59e0b" /></ChartCard>
                <ChartCard title="신규/재방문 비율"><PieBlock data={[{ name: "신규", value: kpis.newUsers || 0 }, { name: "재방문", value: kpis.revisitUsers || 0 }]} /></ChartCard>
                <ChartCard title="센터별 고유 회원"><BarBlock data={(data.centers || []).map((row) => ({ name: String(row.center), value: Number(row.uniqueUsers) }))} color="#16a34a" /></ChartCard>
              </div>
            </>
          )}

          {view === "demographics" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="연령대 분포"><BarBlock data={chartRows(data, "ageDistribution")} layout="vertical" /></ChartCard>
              <ChartCard title="성별 분포"><PieBlock data={chartRows(data, "genderDistribution")} /></ChartCard>
              <ChartCard title="거주지 Top 10"><BarBlock data={chartRows(data, "locationDistribution")} layout="vertical" color="#16a34a" /></ChartCard>
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
              <ChartCard title="센터별 프로그램 수요"><BarBlock data={chartRows(data, "programByCenter")} color="#2563eb" /></ChartCard>
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

          {view === "program-satisfaction" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard title="프로그램 만족도" value={`${(data.survey?.satisfaction.program || 0).toFixed(2)} / 5`} subtitle="설문 응답 기준" color="green" />
                <KpiCard title="설문 응답 수" value={`${formatNumber(data.survey?.total ?? kpis.surveyResponses)}건`} subtitle="프로그램 만족도 분석" color="blue" />
                <KpiCard title="최다 이용 프로그램" value={data.programs?.topName || "-"} subtitle={`${formatNumber(data.programs?.topCount)}건`} color="purple" />
                <KpiCard title="프로그램 종류" value={`${formatNumber(data.programs?.typeCount)}종`} subtitle="예약/대기 데이터 기준" color="amber" />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="프로그램 만족도 순위" empty={chartRows(data, "programSatisfactionRanking").length === 0}>
                  <BarBlock data={chartRows(data, "programSatisfactionRanking")} layout="vertical" color="#10b981" />
                </ChartCard>
                <ChartCard title="가장 만족한 프로그램 TOP 10" empty={chartRows(data, "programLikes").length === 0}>
                  <RankingList data={chartRows(data, "programLikes")} color="#0891b2" />
                </ChartCard>
                <ChartCard title="응답 규모 x 만족도 매트릭스">
                  <ResponsiveContainer width="100%" height={260}>
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid stroke="#eef2f7" />
                      <XAxis type="number" dataKey="value" name="응답 규모" />
                      <YAxis type="number" dataKey="satisfaction" name="만족도" domain={[0, 5]} />
                      <Tooltip formatter={(value: unknown, name: unknown) => [Number(value).toLocaleString(), String(name)]} />
                      <Scatter data={chartRows(data, "programOpportunity")} fill="#2563eb" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="개선 후보 프로그램">
                  <DataTable
                    rows={(data.charts?.programImprovementCandidates || []) as Array<Record<string, string | number>>}
                    columns={[
                      { key: "name", label: "프로그램" },
                      { key: "value", label: "수요" },
                      { key: "satisfaction", label: "만족도" },
                      { key: "responses", label: "응답" },
                    ]}
                  />
                </ChartCard>
              </div>
            </div>
          )}

          {view === "satisfaction" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard title="총 응답 수" value={`${formatNumber(data.survey?.total ?? kpis.surveyResponses)}건`} color="blue" />
                <KpiCard title="프로그램 만족도" value={`${(data.survey?.satisfaction.program || 0).toFixed(2)} / 5`} color="green" />
                <KpiCard title="운영 만족도" value={`${(data.survey?.satisfaction.operation || 0).toFixed(2)} / 5`} color="green" />
                <KpiCard title="디지털 도움 만족도" value={`${(data.survey?.satisfaction.digitalHelp || 0).toFixed(2)} / 5`} color="green" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="만족도 점수 (5점 만점)">
                  <div className="space-y-5 pt-2">
                    <ScoreBar label="프로그램 만족도" score={data.survey?.satisfaction.program} />
                    <ScoreBar label="운영 만족도" score={data.survey?.satisfaction.operation} />
                    <ScoreBar label="디지털기기 사용 도움" score={data.survey?.satisfaction.digitalHelp} />
                  </div>
                </ChartCard>
                <ChartCard title="성별 분포" empty={chartRows(data, "surveyGenderDistribution").length === 0}>
                  <PieBlock data={chartRows(data, "surveyGenderDistribution")} />
                </ChartCard>
                <ChartCard title="연령대 분포" empty={chartRows(data, "surveyAgeDistribution").length === 0}>
                  <BarBlock data={chartRows(data, "surveyAgeDistribution")} color="#8b5cf6" />
                </ChartCard>
                <ChartCard title="알게된 경로" empty={chartRows(data, "inflowDistribution").length === 0}>
                  <RankingList data={chartRows(data, "inflowDistribution")} />
                </ChartCard>
                <ChartCard title="재방문 의향" empty={chartRows(data, "surveyWillReturnDistribution").length === 0}>
                  <PieBlock data={chartRows(data, "surveyWillReturnDistribution")} />
                </ChartCard>
                <ChartCard title="가장 흥미로웠던 프로그램 TOP 10" empty={chartRows(data, "programLikes").length === 0}>
                  <RankingList data={chartRows(data, "programLikes")} color="#10b981" />
                </ChartCard>
                <ChartCard title="방문 횟수 분포" empty={chartRows(data, "surveyVisitCountDistribution").length === 0}>
                  <BarBlock data={chartRows(data, "surveyVisitCountDistribution")} color="#f59e0b" />
                </ChartCard>
                <ChartCard title="월별 응답 추이" empty={chartRows(data, "surveyMonthly").length === 0}>
                  <BarBlock data={chartRows(data, "surveyMonthly")} />
                </ChartCard>
              </div>
            </div>
          )}

          {view === "coupons" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard title="전체 쿠폰" value={formatNumber(data.coupons?.total)} subtitle="API 총계" color="blue" />
                <KpiCard title="지급 완료" value={formatNumber(data.coupons?.given)} subtitle="지급 처리" color="green" />
                <KpiCard title="미지급 쿠폰" value={formatNumber(data.coupons?.notUsed)} subtitle="운영 점검" color={(data.coupons?.notUsed || 0) > 0 ? "red" : "gray"} />
                <KpiCard title="지급률" value={formatPercent(data.coupons?.total ? ((data.coupons.given / data.coupons.total) * 100) : 0)} subtitle="지급 완료 / 전체" color="purple" />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="쿠폰 지급/미지급"><PieBlock data={chartRows(data, "couponStatus")} /></ChartCard>
                <ChartCard title="센터별 쿠폰"><BarBlock data={chartRows(data, "couponByCenter")} color="#7c3aed" /></ChartCard>
                <ChartCard title="일자별 쿠폰 처리"><LineBlock data={chartRows(data, "couponDaily")} color="#16a34a" /></ChartCard>
                <DownloadOnlyCard
                  title="쿠폰 상세"
                  rows={data.coupons?.rows || []}
                  columns={[{ key: "center", label: "센터" }, { key: "name", label: "이름" }, { key: "contact", label: "연락처" }, { key: "createdAt", label: "생성일" }, { key: "givenAt", label: "지급일" }, { key: "status", label: "상태" }]}
                  filename={`didong-v2-coupons-${startDate}-${endDate}.csv`}
                />
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
              <DownloadOnlyCard
                title="운영 점검 상세"
                rows={data.operations?.rows || []}
                columns={[{ key: "center", label: "센터" }, { key: "name", label: "이름" }, { key: "contact", label: "연락처" }, { key: "enteredAt", label: "입장" }, { key: "leavedAt", label: "퇴장" }, { key: "issue", label: "항목" }]}
                filename={`didong-v2-operations-${startDate}-${endDate}.csv`}
              />
            </div>
          )}

          {view === "raw-data" && (
            <div className="space-y-5">
              <DownloadOnlyCard
                title="원천 데이터 조회"
                rows={data.rawData?.rows || []}
                columns={[{ key: "source", label: "구분" }, { key: "center", label: "센터" }, { key: "name", label: "이름" }, { key: "contact", label: "연락처" }, { key: "date", label: "일시" }, { key: "status", label: "상태" }]}
                filename={`didong-v2-raw-data-${startDate}-${endDate}.csv`}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
