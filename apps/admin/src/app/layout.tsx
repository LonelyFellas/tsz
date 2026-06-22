import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "天生字 · 平台后台"
};

// 平台后台:词库/词表管理、用户(学生/老师)管理、老师申请审核、敏感词与公开词表审核。
export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <div className="flex">
          <aside className="min-h-screen w-48 border-r bg-white p-4">
            <h2 className="mb-4 font-bold">平台后台</h2>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href="/words">词库管理</Link>
              <Link href="/wordlists">词表管理</Link>
              <Link href="/users">用户管理</Link>
              <Link href="/reviews">审核中心</Link>
            </nav>
          </aside>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
