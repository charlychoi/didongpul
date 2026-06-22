import { NextRequest, NextResponse } from "next/server";

const DASHBOARD_TO_V3: Record<string, string> = {
  "": "/dashboard-v3/overview",
  overview: "/dashboard-v3/overview",
  centers: "/dashboard-v3/centers",
  time: "/dashboard-v3/overview",
  education: "/dashboard-v3/programs",
  programs: "/dashboard-v3/programs",
  "program-satisfaction": "/dashboard-v3/program-satisfaction",
  surveys: "/dashboard-v3/satisfaction",
  quality: "/dashboard-v3/operations",
  upload: "/dashboard-v3/raw-data",
  settings: "/dashboard-v3/settings",
};

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/dashboard")) return NextResponse.next();
  if (pathname.startsWith("/dashboard-v3")) return NextResponse.next();

  const segment = pathname.replace(/^\/dashboard\/?/, "").split("/")[0] ?? "";
  const target = DASHBOARD_TO_V3[segment] ?? "/dashboard-v3/overview";
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
