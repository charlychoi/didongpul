"use client";

import { logout } from "@/features/auth/actions";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "전체 관리자",
  manager: "센터 관리자",
  viewer: "조회자",
};

export default function Header({
  name,
  role,
  centerScope,
}: {
  name: string;
  role: string;
  centerScope: string;
}) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-sm font-medium text-gray-500">
        서울디지털동행플라자 관리자 통계 대시보드
      </h1>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">
            {ROLE_LABELS[role] ?? role}
            {centerScope !== "ALL" && ` · ${centerScope}`}
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
