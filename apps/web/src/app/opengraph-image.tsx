import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

// 社交分享卡片(微信/X/各平台)的预览大图,动态生成。
// 同一文件同时被 Next 用于 twitter summary_large_image。
export const alt = site.fullName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "96px",
        background: "linear-gradient(135deg, #ffffff 0%, #eaf2ff 100%)",
        color: "#111827"
      }}
    >
      <div
        style={{
          fontSize: 40,
          fontWeight: 600,
          color: site.themeColor,
          letterSpacing: 4
        }}
      >
        科学记忆 · 师生合一
      </div>
      <div style={{ fontSize: 132, fontWeight: 700, marginTop: 24 }}>
        {site.name}
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 500,
          color: "#6b7280",
          marginTop: 16
        }}
      >
        智能英语单词学习平台 · 按遗忘曲线高效背词
      </div>
    </div>,
    { ...size }
  );
}
