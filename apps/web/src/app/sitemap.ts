import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// 仅收录可公开抓取的页面;需登录的页面不进站点地图。
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/login", priority: 0.5, changeFrequency: "monthly" },
    { path: "/register", priority: 0.6, changeFrequency: "monthly" },
    { path: "/forgot-password", priority: 0.3, changeFrequency: "yearly" },
    { path: "/apply-teacher", priority: 0.4, changeFrequency: "monthly" }
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${site.url}${path}`,
    lastModified: now,
    changeFrequency,
    priority
  }));
}
