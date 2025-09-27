import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { ScreenProvider } from "@/components/ScreenProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "轻松看资产 - 股票交易记录系统",
  description: "简单易用的股票交易记录和资产管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: '#c8e4cc' }}
      >
        <ScreenProvider>
          <Header />
          <div className="flex">
            {/* 小屏隐藏 Sidebar，md 及以上显示（桌面最小化也算小屏） */}
            <div className="hidden md:block">
              <Sidebar />
            </div>
            <main className="flex-1 min-h-screen">
              {children}
            </main>
          </div>
        </ScreenProvider>
      </body>
    </html>
  );
}
