import { theme } from "antd";
import type { ReactNode } from "react";

/**
 * 全屏居中壳：登录页、门禁加载态、404 / 路由错误页共用。
 * 背景统一走 colorBgLayout，避免全屏页之间灰/白底跳变；
 * 多个子元素时按 flex 行排列（gap 8），单子元素不受影响。
 */
export function FullscreenCenter({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 16,
        background: token.colorBgLayout
      }}
    >
      {children}
    </div>
  );
}
