"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface UploadResult {
  success?: boolean;
  error?: string;
  message?: string;
  batchId?: string;
  fileName?: string;
  sheets?: { name: string; type: string; rows: number }[];
  totalSaved?: number;
  totalErrors?: number;
  affectedMonths?: string[];
  existingBatchId?: string;
}

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    setFile(f);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await resp.json();
      setResult(data);
      if (resp.ok) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-sm font-medium text-gray-700 mb-4">Excel 파일 업로드</h3>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <svg
          className="w-10 h-10 text-gray-300 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        {file ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500">
              파일을 드래그하거나{" "}
              <button
                type="button"
                className="text-blue-600 hover:text-blue-700 font-medium"
                onClick={() => inputRef.current?.click()}
              >
                직접 선택
              </button>
            </p>
            <p className="text-xs text-gray-400 mt-1">.xlsx, .xls 파일 지원</p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? "업로드 처리 중..." : "업로드 시작"}
        </button>
      )}

      {result && (
        <div className="mt-4">
          {result.error && result.error !== "중복 파일" ? (
            <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
              {result.error}: {result.message ?? ""}
            </div>
          ) : result.error === "중복 파일" ? (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-700">
              <p className="font-medium">중복 파일 경고</p>
              <p className="mt-1">{result.message}</p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm">
              <p className="font-medium text-green-800">업로드 완료: {result.fileName}</p>
              <div className="mt-2 text-green-700 space-y-1">
                <p>저장된 행: {result.totalSaved?.toLocaleString()}건</p>
                {result.totalErrors! > 0 && (
                  <p className="text-amber-600">오류 행: {result.totalErrors}건</p>
                )}
                {result.affectedMonths && result.affectedMonths.length > 0 && (
                  <p>처리된 기간: {result.affectedMonths.join(", ")}</p>
                )}
              </div>
              {result.sheets && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-600 mb-1">처리된 시트:</p>
                  <div className="space-y-1">
                    {result.sheets.map((s, i) => (
                      <div key={i} className="flex gap-2 text-xs text-gray-600">
                        <span className="text-green-600">✓</span>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-gray-400">({s.type})</span>
                        <span>{s.rows.toLocaleString()}행</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
