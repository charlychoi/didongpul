import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import { getLastSyncStatus, markStaleApiSyncBatchesFailed } from "@/lib/api-sync-service";
import UploadForm from "./UploadForm";
import BatchList from "./BatchList";
import ApiSyncPanel from "./ApiSyncPanel";
import SyncedDataPanel from "./SyncedDataPanel";

async function getBatches() {
  await markStaleApiSyncBatchesFailed();

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
    errorMessage: b.errorMessage,
    dupCount: b._count.dataQualityLogs,
  }));
}

async function getSyncedDbStats() {
  const CENTERS = ["강동센터", "도봉센터", "동대문센터"];

  const [visitGroups, surveyGroups, educationGroups, totalGroups, latestVisits] = await Promise.all([
    prisma.cleanVisitLog.groupBy({
      by: ["center"],
      where: { center: { in: CENTERS } },
      _count: { id: true },
    }),
    prisma.surveyResponse.groupBy({
      by: ["center"],
      where: { center: { in: CENTERS } },
      _count: { id: true },
    }),
    prisma.educationAttendance.groupBy({
      by: ["center"],
      where: { center: { in: CENTERS } },
      _count: { id: true },
    }),
    prisma.apiTotalRecord.groupBy({
      by: ["center"],
      where: { center: { in: CENTERS } },
      _count: { id: true },
    }),
    prisma.cleanVisitLog.findMany({
      where: { center: { in: CENTERS } },
      select: { center: true, visitDate: true },
      orderBy: { visitDate: "desc" },
      distinct: ["center"],
    }),
  ]);

  return CENTERS.map((centerName) => ({
    center: centerName,
    visitCount: visitGroups.find((g) => g.center === centerName)?._count.id ?? 0,
    surveyCount: surveyGroups.find((g) => g.center === centerName)?._count.id ?? 0,
    educationCount: educationGroups.find((g) => g.center === centerName)?._count.id ?? 0,
    totalCount: totalGroups.find((g) => g.center === centerName)?._count.id ?? 0,
    latestVisit: latestVisits.find((v) => v.center === centerName)?.visitDate?.toISOString() ?? null,
  }));
}

export default async function UploadPage() {
  await requireAuth();
  const [batches, syncLogs, dbStats] = await Promise.all([
    getBatches(),
    getLastSyncStatus(),
    getSyncedDbStats(),
  ]);

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
        <h2 className="text-lg font-semibold text-gray-900">동기화 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">디동 API 수동 동기화 및 Excel 수동 업로드</p>
      </div>

      {/* API 동기화 패널 (전체 너비) */}
      <ApiSyncPanel lastSyncLogs={serializedLogs} />

      {/* 2열 레이아웃: 왼쪽(Excel 업로드 + 이력) / 오른쪽(DB 현황) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* 왼쪽 2/3: Excel 업로드 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400 font-medium">Excel 수동 업로드</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
          <UploadForm />
          <BatchList batches={batches} />
        </div>

        {/* 오른쪽 1/3: DB 저장 현황 */}
        <div className="lg:col-span-1">
          <SyncedDataPanel stats={dbStats} />
        </div>
      </div>
    </div>
  );
}
