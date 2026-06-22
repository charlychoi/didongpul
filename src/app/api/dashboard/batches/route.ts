import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { markStaleApiSyncBatchesFailed } from "@/lib/api-sync-service";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const page = parseInt(new URL(request.url).searchParams.get("page") ?? "1");
  const limit = 20;

  await markStaleApiSyncBatchesFailed();

  const [batches, total] = await Promise.all([
    prisma.uploadBatch.findMany({
      include: { uploadedBy: { select: { name: true, email: true } } },
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.uploadBatch.count(),
  ]);

  return Response.json({ batches, total, page, totalPages: Math.ceil(total / limit) });
}
