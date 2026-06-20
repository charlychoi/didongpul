"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function signInWithFallbackAdmin(email: string, password: string) {
  const fallbackEmail = process.env.DASHBOARD_ADMIN_EMAIL;
  const fallbackPassword = process.env.DASHBOARD_ADMIN_PASSWORD;

  if (!fallbackEmail || !fallbackPassword) return null;
  if (email !== fallbackEmail || password !== fallbackPassword) return null;

  return {
    id: "dashboard-admin-env",
    email: fallbackEmail,
    name: process.env.DASHBOARD_ADMIN_NAME || "상상우리 관리자",
    role: "super_admin",
    centerScope: "ALL",
  };
}

async function saveLoginSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  centerScope: string;
}) {
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role;
  session.centerScope = user.centerScope;
  session.isLoggedIn = true;
  await session.save();
}

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해주세요." };
  }

  let loginUser: {
    id: string;
    email: string;
    name: string;
    role: string;
    centerScope: string;
  } | null = null;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      const fallbackUser = await signInWithFallbackAdmin(email, password);
      if (!fallbackUser) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
      loginUser = fallbackUser;
    } else if (!(await bcrypt.compare(password, user.passwordHash))) {
      const fallbackUser = await signInWithFallbackAdmin(email, password);
      if (!fallbackUser) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
      loginUser = fallbackUser;
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      loginUser = user;
    }
  } catch {
    const fallbackUser = await signInWithFallbackAdmin(email, password);
    if (!fallbackUser) {
      return { error: "로그인 처리 중 문제가 발생했습니다. 관리자에게 문의해주세요." };
    }
    loginUser = fallbackUser;
  }

  await saveLoginSession(loginUser);
  redirect("/dashboard-v2/overview");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
