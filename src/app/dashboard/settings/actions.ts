"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function changePassword(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return { error: "로그인이 필요합니다." };
  }

  const currentPw = formData.get("currentPassword") as string;
  const newPw = formData.get("newPassword") as string;
  const confirmPw = formData.get("confirmPassword") as string;

  if (!currentPw || !newPw || !confirmPw) {
    return { error: "모든 항목을 입력해주세요." };
  }
  if (newPw.length < 8) {
    return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  }
  if (newPw !== confirmPw) {
    return { error: "새 비밀번호와 확인 비밀번호가 일치하지 않습니다." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "사용자를 찾을 수 없습니다." };

  const valid = await bcrypt.compare(currentPw, user.passwordHash);
  if (!valid) {
    return { error: "현재 비밀번호가 올바르지 않습니다." };
  }

  const hash = await bcrypt.hash(newPw, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });

  return { ok: true };
}
