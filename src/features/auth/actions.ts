"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type FallbackAdmin = {
  id: string;
  password: string;
  name: string;
};

function getFallbackAdmins(): FallbackAdmin[] {
  const admins: FallbackAdmin[] = [];
  const fallbackEmail = process.env.DASHBOARD_ADMIN_EMAIL?.trim();
  const fallbackPassword = process.env.DASHBOARD_ADMIN_PASSWORD;

  if (fallbackEmail && fallbackPassword) {
    admins.push({
      id: fallbackEmail,
      password: fallbackPassword,
      name: process.env.DASHBOARD_ADMIN_NAME || "상상우리 관리자",
    });
  }

  const extraAdmins = process.env.DASHBOARD_EXTRA_ADMINS || "";
  extraAdmins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [id, adminPassword, name] = item.split(":");
      if (id?.trim() && adminPassword) {
        admins.push({
          id: id.trim(),
          password: adminPassword,
          name: name?.trim() || id.trim(),
        });
      }
    });

  return admins;
}

async function signInWithFallbackAdmin(loginId: string, password: string) {
  const fallbackAdmin = getFallbackAdmins().find(
    (admin) => admin.id === loginId && admin.password === password
  );

  if (!fallbackAdmin) return null;

  return {
    id: `dashboard-admin-env:${fallbackAdmin.id}`,
    email: fallbackAdmin.id,
    name: fallbackAdmin.name,
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
  const email = ((formData.get("email") as string) || "").trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "아이디와 비밀번호를 입력해주세요." };
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
      if (!fallbackUser) return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
      loginUser = fallbackUser;
    } else if (!(await bcrypt.compare(password, user.passwordHash))) {
      const fallbackUser = await signInWithFallbackAdmin(email, password);
      if (!fallbackUser) return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
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
  redirect("/dashboard-v3/overview");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
