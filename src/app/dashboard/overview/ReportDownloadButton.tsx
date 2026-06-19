"use client";

import { useState } from "react";

interface Props {
  year: number;
  month: number | null;
  center: string;
  periodLabel: string;
}

export default function ReportDownloadButton({ year, month, center, periodLabel }: Props) {
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);

  const buildParams = () => {
    const params = new URLSearchParams({ year: String(year) });
    if (month) params.set("month", String(month));
    if (center && center !== "ALL") params.set("center", center);
    return params;
  };

  const downloadFile = async (
    url: string,
    filename: string,
    setLoading: (v: boolean) => void
  ) => {
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "다운로드 실패");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      alert(e instanceof Error ? e.message : "파일 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const periodSlug = periodLabel.replace(/\s*~\s*/g, "_").replace(/[^0-9a-zA-Z가-힣_-]/g, "");
  const centerLabel = center !== "ALL" ? `_${center}` : "";

  const handleExcel = () =>
    downloadFile(
      `/api/download/report?${buildParams()}`,
      `SSW_통계데이터_${periodSlug}${centerLabel}.xlsx`,
      setXlsxLoading
    );

  const handleDocx = () =>
    downloadFile(
      `/api/download/docx?${buildParams()}`,
      `SSW_종합보고서_${periodSlug}${centerLabel}.docx`,
      setDocxLoading
    );

  return (
    <div className="flex gap-2">
      <button
        onClick={handleExcel}
        disabled={xlsxLoading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {xlsxLoading ? "생성 중..." : "Excel 통계 다운로드"}
      </button>

      <button
        onClick={handleDocx}
        disabled={docxLoading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {docxLoading ? "AI 보고서 생성 중..." : "AI 종합보고서 (DOCX)"}
      </button>
    </div>
  );
}
