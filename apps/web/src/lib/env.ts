// 只校验浏览器可见变量(NEXT_PUBLIC_*)。服务端私有变量另列一组。
// 启动链仅需两项字符串校验，避免为此下载完整表单校验库。
export const env = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1",
  // 站点对外的规范地址,供 SEO 的 metadataBase / canonical / sitemap / OG 使用。
  // 未配置时回退到本地开发地址,生产部署务必显式注入真实域名。
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
};
// Next 会内联 NEXT_PUBLIC_*，必须逐个显式引用，不能用动态键读取。
if (!env.NEXT_PUBLIC_API_BASE_URL)
  throw new Error("NEXT_PUBLIC_API_BASE_URL 不能为空");
try {
  new URL(env.NEXT_PUBLIC_SITE_URL);
} catch {
  throw new Error("NEXT_PUBLIC_SITE_URL 必须是合法 URL");
}

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
