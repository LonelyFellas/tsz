import { RecoverySession } from "@/features/recovery/RecoverySession";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ADMIN_PERMISSION_UPGRADE_MESSAGE } from "@tsz/api-client";
import { Alert, Button, App as AntApp, ConfigProvider } from "antd";
import { antdTheme } from "@/antd-theme";
import { authRuntime, useAuthStore } from "@/lib/auth";
import {
  adminAccountIdentity,
  bindAdminAuthorizationCache
} from "@/lib/adminAuthorization";
import { useEffect } from "react";
import zhCN from "antd/locale/zh_CN";
import { Outlet, useLocation } from "react-router-dom";
import { useAdminSessionRestore } from "@/features/auth/hooks/useAdminSessionRestore";

// 单例 QueryClient：全局唯一，避免每次渲染重建缓存。默认项（staleTime 等）取自
// @tsz/shared 的 browserQueryDefaults，与 web 共用同一份，避免两处漂移。
bindAdminAuthorizationCache(useAuthStore, queryClient);

// 根布局 element：QueryClientProvider + antd ConfigProvider + 会话恢复，包住所有路由。
// 挂载时用 admin refresh cookie 静默恢复会话，写入 profile / level / hydrated。
// AntApp 提供 message/modal/notification 的 context 版（v6 起不建议再用静态方法）。
export function RootProviders() {
  const { pathname } = useLocation();
  const permissionModelIncompatible = useAuthStore(
    (s) => s.permissionModelIncompatible
  );
  useEffect(() => {
    const recovered = () => {
      if (useAuthStore.getState().profile)
        void queryClient.refetchQueries({
          type: "active",
          predicate: (query) => query.state.status === "error"
        });
    };
    const refresh = () => {
      if (authRuntime.tokens.getToken())
        void authRuntime.refreshProfile().catch(() => undefined);
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("tsz:session-recovered", recovered);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("tsz:session-recovered", recovered);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const identity = useAuthStore((s) => adminAccountIdentity(s.profile));
  const { retry, retrying } = useAdminSessionRestore();
  const refreshUnconfirmed = useAuthStore((s) => s.refreshUnconfirmed);
  const connectionError = useAuthStore((s) => s.connectionError);
  const hydrated = useAuthStore((s) => s.hydrated);
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN} theme={antdTheme}>
        <RecoverySession />
        <AntApp key={identity}>
          {permissionModelIncompatible && pathname !== "/login" && (
            <Alert
              type="error"
              showIcon
              title={ADMIN_PERMISSION_UPGRADE_MESSAGE}
            />
          )}
          {!permissionModelIncompatible &&
            (connectionError || refreshUnconfirmed) && (
              <Alert
                type="warning"
                showIcon
                title={
                  refreshUnconfirmed
                    ? "会话刷新结果尚未确认，请重新登录；当前操作请先查看结果"
                    : hydrated
                      ? "连接暂时中断，联网后将自动恢复；当前内容已保留"
                      : "正在恢复连接，联网后将自动继续"
                }
                action={
                  <Button
                    loading={retrying}
                    onClick={() =>
                      refreshUnconfirmed
                        ? window.location.assign("/login")
                        : void retry()
                    }
                  >
                    {refreshUnconfirmed ? "重新登录" : "重试连接"}
                  </Button>
                }
              />
            )}
          <Outlet />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
