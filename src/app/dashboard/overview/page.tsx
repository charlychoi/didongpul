import { Suspense } from "react";
import FilterPanel from "@/components/ui/FilterPanel";
import OverviewContent from "./OverviewContent";

export default function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">종합 현황</h2>
          <p className="text-sm text-gray-500 mt-0.5">전체 방문 현황 및 주요 지표</p>
        </div>
      </div>

      <Suspense fallback={<div className="text-sm text-gray-400">필터 로딩 중...</div>}>
        <FilterPanel />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        }
      >
        <OverviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
