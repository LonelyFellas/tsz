import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

// iOS「添加到主屏」图标:留白更克制,圆角由系统裁切。
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: site.themeColor,
        color: "#ffffff",
        fontSize: 120,
        fontWeight: 700
      }}
    >
      天
    </div>,
    { ...size }
  );
}
