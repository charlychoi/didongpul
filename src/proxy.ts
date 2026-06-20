import { NextRequest, NextResponse } from "next/server";

const DASHBOARD_TO_V2: Record<string, string> = {
  "": "/dashboard-v2/overview",
  overview: "/dashboard-v2/overview",
  centers: "/dashboard-v2/centers",
  time: "/dashboard-v2/overview",
  education: "/dashboard-v2/programs",
  programs: "/dashboard-v2/programs",
  "program-satisfaction": "/dashboard-v2/program-satisfaction",
  surveys: "/dashboard-v2/satisfaction",
  quality: "/dashboard-v2/operations",
  upload: "/dashboard-v2/raw-data",
  settings: "/dashboard-v2/settings",
};

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/dashboard")) return NextResponse.next();
  if (pathname.startsWith("/dashboard-v2")) return NextResponse.next();

  const segment = pathname.replace(/^\/dashboard\/?/, "").split("/")[0] ?? "";
  const target = DASHBOARD_TO_V2[segment] ?? "/dashboard-v2/overview";
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
