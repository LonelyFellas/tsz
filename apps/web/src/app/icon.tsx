import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

// 动态生成的站点图标(favicon / 标签页),省去维护二进制资源。
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
        fontSize: 320,
        fontWeight: 700,
        borderRadius: 96
      }}
    >
      天
    </div>,
    { ...size }
  );
}
