import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "서울디지털동행플라자 관리자 대시보드",
  description: "서울디지털동행플라자 방문자 통계 관리자 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
