import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// 抓取规则:开放公开页,屏蔽需登录的个人/师生空间与接口。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/account",
        "/account/",
        "/student/",
        "/teacher/",
        "/onboarding"
      ]
    },
    sitemap: `${site.url}/sitemap.xml`
  };
}
