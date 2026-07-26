import { theme } from "antd";
import type { ReactNode } from "react";

/**
 * 全屏居中壳：登录页、门禁加载态、404 / 路由错误页共用。
 * 背景统一走 colorBgLayout，避免全屏页之间灰/白底跳变；
 * 默认多个子元素按 flex 行排列（gap 8）；vertical 时改为纵向堆叠
 * （gap 置 0，间距由子元素自行控制），供「卡片 + 页脚」类页面用。
 */
export function FullscreenCenter({
  children,
  vertical = false
}: {
  children: ReactNode;
  vertical?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: vertical ? 0 : 8,
        padding: 16,
        background: token.colorBgLayout
      }}
    >
      {children}
    </div>
  );
}
