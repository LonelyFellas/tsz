import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { WebVitals } from "./web-vitals";

export const metadata: Metadata = {
  title: "天生会背",
  description: "词汇学习平台"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
        <WebVitals />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
