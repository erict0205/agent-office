import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eric’s Agent Office · 小小工作室",
  description: "一間有溫度的 3D 辦公室，讓 Agent 的工作狀態看得見。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
