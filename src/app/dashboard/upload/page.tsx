import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import { getLastSyncStatus } from "@/lib/api-sync-service";
import UploadForm from "./UploadForm";
import BatchList from "./BatchList";
import ApiSyncPanel from "./ApiSyncPanel";

async function getBatches() {
  const batches = await prisma.uploadBatch.findMany({
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { dataQualityLogs: { where: { issueType: "duplicate_visit" } } } },
    },
    orderBy: { uploadedAt: "desc" },
    take: 20,
  });
  return batches.map((b) => ({
    id: b.id,
    originalFilename: b.originalFilename,
    sourceType: b.sourceType,
    uploadedAt: b.uploadedAt.toISOString(),
    uploadedBy: b.uploadedBy,
    detectedSheetsCount: b.detectedSheetsCount,
    rowCountTotal: b.rowCountTotal,
    status: b.status,
    dupCount: b._count.dataQualityLogs,
  }));
}

export default async function UploadPage() {
  await requireAuth();
  const [batches, syncLogs] = await Promise.all([getBatches(), getLastSyncStatus()]);

  const serializedLogs = syncLogs.map((l) => ({
    id: l.id,
    center: l.center,
    syncType: l.syncType,
    syncedFrom: l.syncedFrom,
    syncedTo: l.syncedTo,
    recordsFetched: l.recordsFetched,
    recordsInserted: l.recordsInserted,
    status: l.status,
    errorMessage: l.errorMessage,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">업로드 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">Excel 수동 업로드 및 API 자동 동기화</p>
      </div>

      {/* API 자동 동기화 패널 */}
      <ApiSyncPanel lastSyncLogs={serializedLogs} />

      {/* 구분선 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400 font-medium">Excel 수동 업로드</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <UploadForm />

      <BatchList batches={batches} />
    </div>
  );
}
