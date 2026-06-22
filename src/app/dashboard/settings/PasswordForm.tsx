"use client";

import { useState, useRef } from "react";
import { changePassword } from "./actions";

export default function PasswordForm({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const formData = new FormData(e.currentTarget);
    const result = await changePassword(formData);

    if (result?.ok) {
      setStatus("success");
      setMessage("비밀번호가 성공적으로 변경되었습니다.");
      formRef.current?.reset();
    } else {
      setStatus("error");
      setMessage(result?.error ?? "오류가 발생했습니다.");
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-md">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">비밀번호 변경</h3>
      <p className="text-xs text-gray-500 mb-5">계정: {email}</p>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">현재 비밀번호</label>
          <input
            type="password"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="현재 비밀번호 입력"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">새 비밀번호</label>
          <input
            type="password"
            name="newPassword"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="8자 이상"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
          <input
            type="password"
            name="confirmPassword"
            required
            autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="새 비밀번호 재입력"
          />
        </div>

        {message && (
          <div
            className={`text-sm px-3 py-2 rounded-lg ${
              status === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {status === "loading" ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
