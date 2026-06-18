import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import UploadForm from "./UploadForm";
import BatchList from "./BatchList";

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
  const batches = await getBatches();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">업로드 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">Excel 파일 업로드 및 이력 관리</p>
      </div>

      <UploadForm />

      <BatchList batches={batches} />
    </div>
  );
}
