import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// PWA manifest:支持「添加到主屏」并提供品牌色与图标。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.fullName,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: site.themeColor,
    lang: "zh-CN",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
