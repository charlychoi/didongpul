import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import Link from "next/link";

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

export default async function BatchList() {
  await requireAuth();

  const batches = await prisma.uploadBatch.findMany({
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { dataQualityLogs: { where: { issueType: "duplicate_visit" } } } },
    },
    orderBy: { uploadedAt: "desc" },
    take: 20,
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-700">업로드 이력</h3>
        <p className="text-xs text-gray-400">최근 20건</p>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          아직 업로드된 파일이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">파일명</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">업로드 일시</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">업로드자</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">시트 수</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">저장 행</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">중복자 수</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">상태</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">품질 점검</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batches.map((b) => {
                const dupCount = b._count.dataQualityLogs;
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
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
                      {dupCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          {dupCount.toLocaleString()}
                          <span className="text-xs text-amber-400">건</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/quality?batchId=${b.id}`}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        점검 결과 보기
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
