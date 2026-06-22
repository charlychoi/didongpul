"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  HeartPulse,
  MonitorCheck,
  Settings,
  Sparkles,
  Table2,
  Ticket,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/dashboard-v3/overview", label: "운영 종합", icon: Activity },
  { href: "/dashboard-v3/centers", label: "센터 성과", icon: Building2 },
  { href: "/dashboard-v3/members", label: "회원·재방문", icon: UserRound },
  { href: "/dashboard-v3/demographics", label: "이용자 특성", icon: Users },
  { href: "/dashboard-v3/programs", label: "프로그램 수요", icon: MonitorCheck },
  { href: "/dashboard-v3/program-satisfaction", label: "프로그램 만족도", icon: Sparkles },
  { href: "/dashboard-v3/satisfaction", label: "설문 만족도", icon: HeartPulse },
  { href: "/dashboard-v3/coupons", label: "쿠폰 운영", icon: Ticket },
  { href: "/dashboard-v3/operations", label: "운영 리스크", icon: AlertTriangle },
  { href: "/dashboard-v3/raw-data", label: "원천 데이터", icon: Table2 },
  { href: "/dashboard-v3/settings", label: "계정 설정", icon: Settings },
];

export default function DashboardV3Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="h-16 flex items-center px-4 border-b border-gray-200">
        <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center mr-3">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">누적 운영 대시보드</p>
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
          <p className="text-xs font-medium text-gray-700">v3 API 기반</p>
          <p className="text-xs text-gray-500 mt-0.5">엑셀 업로드 메뉴와 분리</p>
        </div>
      </div>
    </aside>
  );
}
