import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import { resourceRecoveryScript } from "@tsz/shared/recovery";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/lib/site";
import { themeInitScript } from "@/lib/theme";
import {
  openGraphLocale,
  webLocaleBootScript,
  webLocaleBootStyle
} from "@/i18n/snapshot";
import { getWebLocale } from "@/i18n/server";
import { Providers } from "./providers";
import { WebVitals } from "./web-vitals";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    // 为相对路径的 OG/canonical/图标提供绝对基地址。
    metadataBase: new URL(site.url),
    title: {
      default: uiText(site.fullName),
      // 子页面只需给出短标题,自动拼成「短标题 | 天生会背」。
      template: `%s | ${site.name}`
    },
    description: uiText(site.description),
    keywords: site.keywords.map((keyword) => uiText(keyword)),
    applicationName: site.name,
    // 首页规范地址;子页面各自覆盖。
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: uiText(site.fullName),
      description: uiText(site.description),
      url: site.url,
      locale: openGraphLocale[await getWebLocale()]
    },
    twitter: {
      card: "summary_large_image",
      title: uiText(site.fullName),
      description: uiText(site.description)
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
}

export const viewport: Viewport = {
  themeColor: site.themeColor
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const initialLocale = await getWebLocale();
  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: webLocaleBootStyle }} />
        <script dangerouslySetInnerHTML={{ __html: webLocaleBootScript }} />
        <script
          dangerouslySetInnerHTML={{
            __html: resourceRecoveryScript(
              process.env.TSZ_RELEASE_ID ?? "local",
              ["/_next/static/"]
            )
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* 首屏前置:在 paint 前给 <html> 打上明/暗 class,杜绝主题闪烁。 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <div
          className="grid-backdrop pointer-events-none fixed inset-0 -z-10"
          aria-hidden
        />
        <WebVitals />
        <Providers initialLocale={initialLocale}>{children}</Providers>
      </body>
    </html>
  );
}
