import { getServerWebText, getWebLocale } from "@/i18n/server";
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

import { Providers } from "./providers";
import { WebVitals } from "./web-vitals";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  const locale = await getWebLocale();
  const image = `/share-image/${locale}`;
  return {
    // 为相对路径的 OG/canonical/图标提供绝对基地址。
    metadataBase: new URL(site.url),
    title: {
      default: uiText("webApp:english_vocabulary_learning"),
      // 子页面只需给出短标题,自动拼成「短标题 | 天生会背」。
      template: `%s | ${site.name}`
    },
    description: uiText(
      "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
    ),
    keywords: (
      [
        "webApp:english_vocabulary",
        "webApp:learn_vocabulary",
        "webApp:word_memory",
        "webApp:forgetting_curve",
        "webApp:vocabulary_learning",
        "webApp:english_learning_platform",
        "webApp:students_and_teachers",
        "webApp:brand"
      ] as const
    ).map((keyword) => uiText(keyword)),
    applicationName: site.name,
    manifest: `/manifest/${locale}`,
    // 首页规范地址;子页面各自覆盖。
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: uiText("webApp:english_vocabulary_learning"),
      description: uiText(
        "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
      ),
      url: site.url,
      locale: openGraphLocale[locale],
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: uiText("webApp:english_vocabulary_learning")
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      images: [
        { url: image, alt: uiText("webApp:english_vocabulary_learning") }
      ],
      title: uiText("webApp:english_vocabulary_learning"),
      description: uiText(
        "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
      )
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
