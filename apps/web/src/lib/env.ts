import { z } from "zod";

// 只校验浏览器可见变量(NEXT_PUBLIC_*)。服务端私有变量另列一组。
const schema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().min(1).default("/api/v1"),
  // 站点对外的规范地址,供 SEO 的 metadataBase / canonical / sitemap / OG 使用。
  // 未配置时回退到本地开发地址,生产部署务必显式注入真实域名。
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000")
});

// Next 会内联 NEXT_PUBLIC_* 到打包产物,必须逐个显式引用(不能用 process.env 动态键)。
export const env = schema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL
});

// 生产构建告警:若忘了注入真实域名,canonical/sitemap/OG 会全部指向 localhost,
// 且不易察觉(SEO 静默失效)。这里只告警不抛错——CI 的 e2e/verify 等也跑 production 构建
// 但用 localhost 冒烟,硬抛错会误伤它们。真实部署时运维可在构建日志看到此警告。
if (
  typeof window === "undefined" &&
  process.env.NODE_ENV === "production" &&
  /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.NEXT_PUBLIC_SITE_URL)
) {
  console.warn(
    "[SEO] NEXT_PUBLIC_SITE_URL 仍为本地地址,canonical/sitemap/Open Graph 将指向 localhost。生产部署务必注入真实站点域名。"
  );
}
