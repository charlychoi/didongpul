"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Globe2,
  HeartPulse,
  MonitorCheck,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/dashboard-v2/overview", label: "운영 종합", icon: Activity },
  { href: "/dashboard-v2/centers", label: "센터 성과", icon: Building2 },
  { href: "/dashboard-v2/visitors", label: "이용자 분석", icon: Users },
  { href: "/dashboard-v2/programs", label: "프로그램 수요", icon: MonitorCheck },
  { href: "/dashboard-v2/satisfaction", label: "만족도 인사이트", icon: HeartPulse },
  { href: "/dashboard-v2/marketing", label: "홍보/웹 전환", icon: Globe2 },
  { href: "/dashboard-v2/operations", label: "운영 리스크", icon: AlertTriangle },
  { href: "/dashboard/settings", label: "계정 설정", icon: Settings },
];

export default function DashboardV2Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="h-16 flex items-center px-4 border-b border-gray-200">
        <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center mr-3">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">API 운영 대시보드</p>
          <p className="text-xs text-gray-500">강동 · 도봉 · 동대문</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-slate-900 text-white font-medium"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-200">
        <div className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
          <p className="text-xs font-medium text-gray-700">v2 API 기반</p>
          <p className="text-xs text-gray-500 mt-0.5">엑셀 업로드 메뉴와 분리</p>
        </div>
      </div>
    </aside>
  );
}
