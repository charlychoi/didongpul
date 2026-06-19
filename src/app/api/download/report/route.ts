import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;
    const centerFilter = searchParams.get("center") ?? "ALL";
    const centerScope =
      session.centerScope !== "ALL"
        ? session.centerScope
        : centerFilter !== "ALL"
        ? centerFilter
        : null;

    // Step 1: monthly summary (known to work)
    const monthly = await prisma.monthlyCenterSummary.findMany({
      where: {
        year,
        ...(month ? { month } : {}),
        ...(centerScope ? { center: centerScope } : {}),
      },
      orderBy: [{ center: "asc" }, { month: "asc" }],
    });

    const totalVisits = monthly.reduce((s, r) => s + r.visitCount, 0);
    const totalUnique = monthly.reduce((s, r) => s + r.uniqueVisitorCount, 0);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["서울디지털동행플라자 통계"],
      [],
      ["조회 기간", month ? `${year}년 ${month}월` : `${year}년 전체`],
      ["총 방문건수", totalVisits],
      ["고유 방문자 수", totalUnique],
      [],
      ["센터", "연도", "월", "방문건수", "고유방문자"],
      ...monthly.map((r) => [r.center, r.year, r.month, r.visitCount, r.uniqueVisitorCount]),
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "요약");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="SSW_통계_${year}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[report] error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
