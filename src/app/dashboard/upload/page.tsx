import { Suspense } from "react";
import UploadForm from "./UploadForm";
import BatchList from "./BatchList";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">업로드 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">Excel 파일 업로드 및 업로드 이력 관리</p>
      </div>

      <UploadForm />

      <Suspense fallback={<div className="h-64 bg-gray-100 rounded-lg animate-pulse" />}>
        <BatchList />
      </Suspense>
    </div>
  );
}
