import { requireAuth } from "@/features/auth/middleware";
import PasswordForm from "./PasswordForm";

export default async function SettingsPage() {
  const session = await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">계정 설정</h2>
        <p className="text-sm text-gray-500 mt-0.5">비밀번호 등 계정 정보를 관리합니다.</p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-md">
        <p className="text-xs text-gray-500 mb-1">현재 로그인 계정</p>
        <p className="text-sm font-medium text-gray-900">{session.email}</p>
        <p className="text-xs text-gray-500 mt-0.5">{session.name} · {session.role === "super_admin" ? "전체 관리자" : "센터 관리자"}</p>
      </div>

      <PasswordForm email={session.email ?? ""} />
    </div>
  );
}
