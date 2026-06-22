import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 50;

  const where = batchId ? { uploadBatchId: batchId } : {};

  const [bySeverity, byIssueType, bySheet, issues, total] = await Promise.all([
    prisma.dataQualityLog.groupBy({
      by: ["severity"],
      where,
      _count: { id: true },
    }),
    prisma.dataQualityLog.groupBy({
      by: ["issueType"],
      where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.dataQualityLog.groupBy({
      by: ["sheetName"],
      where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.dataQualityLog.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.dataQualityLog.count({ where }),
  ]);

  const criticalCount = bySeverity.find((b) => b.severity === "critical")?._count.id ?? 0;
  const warningCount = bySeverity.find((b) => b.severity === "warning")?._count.id ?? 0;
  const infoCount = bySeverity.find((b) => b.severity === "info")?._count.id ?? 0;
  const qualityScore = Math.max(0, 100 - criticalCount * 3 - warningCount * 1 - infoCount * 0.2);

  return Response.json({
    qualityScore: Math.round(qualityScore * 10) / 10,
    bySeverity,
    byIssueType,
    bySheet,
    issues,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
