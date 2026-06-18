import { Suspense } from "react";
import FilterPanel from "@/components/ui/FilterPanel";
import TimeContent from "./TimeContent";

export default function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">시간·혼잡 분석</h2>
        <p className="text-sm text-gray-500 mt-0.5">시간대별·요일별 방문 패턴 분석</p>
      </div>
      <Suspense fallback={null}>
        <FilterPanel />
      </Suspense>
      <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
        <TimeContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
