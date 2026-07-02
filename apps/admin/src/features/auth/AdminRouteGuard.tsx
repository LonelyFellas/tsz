import { Spin, Typography } from "antd";
import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { useAuthStore } from "@/lib/auth";

/**
 * 后台门禁守卫（客户端）：
 * - 会话恢复完成（hydrated）前只显示加载态，避免把「恢复中」误判为「未登录」。
 * - 未登录 → 跳 /login?redirect=<当前路径>。
 *
 * 后台是与 web 完全独立的账号体系：能拿到 /admin/profile 就是有效 admin，
 * 不存在「已登录但不是 admin」的中间态（不再有角色判定）。level 只影响菜单可见性，
 * 由各页面自行按 super_admin 控制，不在门禁层处理。
 */
export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hydrated);
  const navigate = useNavigate();
  const location = useLocation();
  // 完整回跳目标：含 query 与 hash，否则登录后会丢掉筛选/分页/锚点等上下文。
  const redirectTo = `${location.pathname}${location.search}${location.hash}`;

  const needsLogin = hydrated && !profile;

  useEffect(() => {
    if (needsLogin) {
      navigate(`/login?redirect=${encodeURIComponent(redirectTo)}`, {
        replace: true
      });
    }
  }, [needsLogin, redirectTo, navigate]);

  if (!hydrated || needsLogin) {
    return (
      <FullscreenCenter>
        <Spin size="small" />
        <Typography.Text type="secondary">加载中...</Typography.Text>
      </FullscreenCenter>
    );
  }

  return <>{children}</>;
}
