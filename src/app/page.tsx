import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard-v2/overview");
}
