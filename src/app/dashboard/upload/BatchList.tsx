"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  completed: "완료",
  processing: "처리중",
  failed: "실패",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
};

interface Batch {
  id: string;
  originalFilename: string;
  uploadedAt: string;
  uploadedBy: { name: string };
  detectedSheetsCount: number;
  rowCountTotal: number;
  status: string;
  errorMessage: string | null;
  dupCount: number;
}

export default function BatchList({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleDelete = async (batchId: string) => {
    setDeletingId(batchId);
    try {
      const res = await fetch(`/api/upload/${batchId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      router.refresh();
    } catch {
      alert("삭제 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  if (batches.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="text-center py-12 text-sm text-gray-400">
          아직 업로드된 파일이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 삭제 확인 모달 */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">배치 삭제 확인</h3>
            <p className="text-sm text-gray-600 mb-1">
              이 배치와 관련된 데이터를 정리합니다.
            </p>
            <p className="text-sm text-gray-500 mb-5">
              처리중 항목은 즉시 중단 처리되고, 완료된 항목은 관련 데이터 삭제 후 통계가 재계산됩니다.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                disabled={deletingId === confirmId}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
                disabled={deletingId === confirmId}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 min-w-[80px]"
              >
                {deletingId === confirmId ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-700">업로드 이력</h3>
          <p className="text-xs text-gray-400">최근 20건</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">파일명</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">업로드 일시</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">업로드자</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">시트 수</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">신규 추가</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">기존 데이터(skip)</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">상태</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">품질 점검</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                    {b.originalFilename}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(b.uploadedAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.uploadedBy.name}</td>
                  <td className="px-4 py-3 text-gray-600">{b.detectedSheetsCount}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {b.rowCountTotal.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.dupCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                        {b.dupCount.toLocaleString()}
                        <span className="text-xs text-amber-400">건</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                      {b.status === "failed" && b.errorMessage && (
                        <p className="max-w-[180px] text-xs text-red-500 line-clamp-2">
                          {b.errorMessage}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/quality?batchId=${b.id}`}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      점검 결과 보기
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setConfirmId(b.id)}
                      disabled={deletingId === b.id}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
