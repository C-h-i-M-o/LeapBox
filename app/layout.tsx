import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "跃匣 LeapBox · 私人文件管理",
  description: "跃匣 LeapBox，安静、可靠的私人文件管理空间。",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
