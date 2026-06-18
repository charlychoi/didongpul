import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (session.role !== "super_admin") {
    redirect("/dashboard");
  }
  return session;
}
