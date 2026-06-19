"use client";

interface Props {
  year: number;
  month: number | null;
  center: string;
  periodLabel: string;
}

export default function ReportDownloadButton({ year, month, center }: Props) {
  const params = new URLSearchParams({ year: String(year) });
  if (month) params.set("month", String(month));
  if (center && center !== "ALL") params.set("center", center);

  return (
    <a
      href={`/api/download/report?${params}`}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Excel 통계 다운로드
    </a>
  );
}
