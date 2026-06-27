import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "天生会背 · 平台后台"
};

// 平台后台:词库/词表管理、用户(学生/老师)管理、老师申请审核、敏感词与公开词表审核。
// 根布局只装配会话恢复（Providers）；受保护的后台壳与门禁在 (console) 分组布局里。
export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
