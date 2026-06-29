import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// 收录的页面内容最近一次实质更新的日期。手工维护:改动落地页/公开页文案时一并更新。
// 不用 new Date(),否则每次构建都谎报"刚更新",lastModified 信号会被爬虫忽略。
const LAST_CONTENT_UPDATE = new Date("2026-06-28");

// 仅收录可公开抓取、且对 SEO 有价值的页面。
// 需登录的页面不进;登录/找回密码这类纯功能页对搜索无价值,也不收录(只留获客入口)。
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/register", priority: 0.6, changeFrequency: "monthly" },
    { path: "/apply-teacher", priority: 0.4, changeFrequency: "monthly" }
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${site.url}${path}`,
    lastModified: LAST_CONTENT_UPDATE,
    changeFrequency,
    priority
  }));
}
