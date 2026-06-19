"use client";

import { useState } from "react";

interface Props {
  year: number;
  month: number | null;
  center: string;
  periodLabel: string;
}

export default function ReportDownloadButton({ year, month, center, periodLabel }: Props) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (month) params.set("month", String(month));
      if (center && center !== "ALL") params.set("center", center);

      const res = await fetch(`/api/download/report?${params}`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const periodSlug = periodLabel.replace(/\s*~\s*/g, "_").replace(/[^0-9a-zA-Z가-힣_-]/g, "");
      const centerSuffix = center !== "ALL" ? `_${center}` : "";
      a.download = `SSW_통계데이터_${periodSlug}${centerSuffix}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {loading ? "생성 중..." : "Excel 통계 다운로드"}
      </button>
      {errorMsg && (
        <p className="text-xs text-red-600 max-w-sm text-right break-all">{errorMsg}</p>
      )}
    </div>
  );
}
