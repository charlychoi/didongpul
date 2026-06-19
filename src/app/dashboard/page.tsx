import { redirect } from "next/navigation";

export default function DashboardRoot() {
  redirect("/dashboard-v2/overview");
}
