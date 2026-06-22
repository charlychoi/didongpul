import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/features/auth/middleware";
import KpiCard from "@/components/ui/KpiCard";
import InsightPanel from "@/components/ui/InsightPanel";
import EducationCharts from "./EducationCharts";

export default async function EducationContent({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const year = parseInt(params.year ?? String(new Date().getFullYear()));
  const month = params.month ? parseInt(params.month) : null;
  const centerParam = params.center ?? "ALL";
  const centerScope =
    session.centerScope !== "ALL" ? session.centerScope : centerParam !== "ALL" ? centerParam : null;

  const where = {
    year,
    ...(month ? { month } : {}),
    ...(centerScope ? { center: centerScope } : {}),
  };

  const [byCenter, byMonth, topPrograms, distribution] = await Promise.all([
    prisma.educationAttendance.groupBy({
      by: ["center"],
      where: { ...where, attendanceStatus: "참석" },
      _count: { id: true },
    }),
    prisma.educationAttendance.groupBy({
      by: ["year", "month"],
      where: { ...where, attendanceStatus: "참석" },
      _count: { id: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.educationAttendance.groupBy({
      by: ["programName"],
      where: { ...where, attendanceStatus: "참석", programName: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.educationAttendance.groupBy({
      by: ["attendanceStatus"],
      where,
      _count: { id: true },
    }),
  ]);

  const totalAttendance = distribution.find((d) => d.attendanceStatus === "참석")?._count.id ?? 0;
  const totalAbsence = distribution.find((d) => d.attendanceStatus === "불참")?._count.id ?? 0;
  const totalUnknown = distribution.find((d) => d.attendanceStatus === "미상")?._count.id ?? 0;
  const total = totalAttendance + totalAbsence + totalUnknown;
  const attendanceRate = total > 0 ? (totalAttendance / total) * 100 : null;

  const topCenter = [...byCenter].sort((a, b) => b._count.id - a._count.id)[0];
  const topProgram = topPrograms[0];

  const insights = [];
  if (topCenter) {
    insights.push({
      text: `교육 참석이 가장 많은 센터는 ${topCenter.center}(${topCenter._count.id.toLocaleString()}명)입니다.`,
      type: "info" as const,
    });
  }
  if (topProgram) {
    insights.push({
      text: `가장 인기 있는 교육 프로그램은 "${topProgram.programName}"(${topProgram._count.id}명)입니다.`,
      type: "positive" as const,
    });
  }
  if (attendanceRate != null) {
    insights.push({
      text: `전체 교육 참석률은 ${attendanceRate.toFixed(1)}%입니다.`,
      type: attendanceRate >= 70 ? ("positive" as const) : ("warning" as const),
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="총 참석 인원" value={totalAttendance.toLocaleString()} color="green" />
        <KpiCard title="불참 인원" value={totalAbsence.toLocaleString()} color="amber" />
        <KpiCard
          title="참석률"
          value={attendanceRate != null ? `${attendanceRate.toFixed(1)}%` : "-"}
          color={attendanceRate != null && attendanceRate >= 70 ? "green" : "amber"}
        />
        <KpiCard title="TOP 프로그램" value={topProgram?.programName ?? "-"} color="purple" />
      </div>

      <InsightPanel insights={insights} title="교육 참석 인사이트" />

      <EducationCharts
        byCenter={byCenter.map((r) => ({ center: r.center ?? "미상", count: r._count.id }))}
        byMonth={byMonth.map((r) => ({
          month: `${r.year}-${String(r.month).padStart(2, "0")}`,
          count: r._count.id,
        }))}
        topPrograms={topPrograms.map((r) => ({
          name: r.programName ?? "미상",
          count: r._count.id,
        }))}
        distribution={[
          { status: "참석", count: totalAttendance },
          { status: "불참", count: totalAbsence },
          { status: "미상", count: totalUnknown },
        ].filter((d) => d.count > 0)}
      />
    </div>
  );
}
