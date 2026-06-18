import { Suspense } from "react";
import FilterPanel from "@/components/ui/FilterPanel";
import CentersContent from "./CentersContent";

export default function CentersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">센터 비교</h2>
        <p className="text-sm text-gray-500 mt-0.5">강동·도봉·동대문 센터별 운영 현황 비교</p>
      </div>
      <Suspense fallback={null}>
        <FilterPanel showCenter={false} />
      </Suspense>
      <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
        <CentersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
