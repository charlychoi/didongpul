import { Suspense } from "react";
import QualityContent from "./QualityContent";

export default function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; page?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">데이터 품질 점검</h2>
        <p className="text-sm text-gray-500 mt-0.5">데이터 오류·누락·이상값 현황</p>
      </div>
      <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
        <QualityContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
