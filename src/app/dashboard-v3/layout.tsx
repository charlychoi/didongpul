import { requireAuth } from "@/features/auth/middleware";
import DashboardV3Sidebar from "@/components/layout/DashboardV3Sidebar";
import Header from "@/components/layout/Header";

export default async function DashboardV3Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <DashboardV3Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header name={session.name} role={session.role} centerScope={session.centerScope} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
