import { Suspense } from "react";
import FilterPanel from "@/components/ui/FilterPanel";
import EducationContent from "./EducationContent";

export default function EducationPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">교육 참석 분석</h2>
        <p className="text-sm text-gray-500 mt-0.5">교육 프로그램별·센터별 참석 현황</p>
      </div>
      <Suspense fallback={null}>
        <FilterPanel />
      </Suspense>
      <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
        <EducationContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
