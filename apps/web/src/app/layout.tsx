import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/lib/site";
import { themeInitScript } from "@/lib/theme";
import { Providers } from "./providers";
import { WebVitals } from "./web-vitals";

export const metadata: Metadata = {
  // 为相对路径的 OG/canonical/图标提供绝对基地址。
  metadataBase: new URL(site.url),
  title: {
    default: site.fullName,
    // 子页面只需给出短标题,自动拼成「短标题 | 天生会背」。
    template: `%s | ${site.name}`
  },
  description: site.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  // 首页规范地址;子页面各自覆盖。
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.fullName,
    description: site.description,
    url: site.url,
    locale: site.locale
  },
  twitter: {
    card: "summary_large_image",
    title: site.fullName,
    description: site.description
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  }
};

export const viewport: Viewport = {
  themeColor: site.themeColor
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* 首屏前置:在 paint 前给 <html> 打上明/暗 class,杜绝主题闪烁。 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <WebVitals />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
