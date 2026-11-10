import { useAdminTranslation } from "@/i18n";
import { AdminBootFallback, useAdminLocaleReady } from "@/i18n/boot";
import { UnplugIcon } from "lucide-react";
import { RecoverySession } from "@/features/recovery/RecoverySession";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Alert, Button } from "@tsz/ui/admin/display";
import { App as FeedbackApp } from "@tsz/ui/admin/overlays";
import { authRuntime, useAuthStore } from "@/lib/auth";
import {
  adminAccountIdentity,
  bindAdminAuthorizationCache
} from "@/lib/adminAuthorization";
import { useEffect, type ReactNode } from "react";
import { Outlet, useMatch } from "react-router-dom";
import { useAdminSessionRestore } from "@/features/auth/hooks/useAdminSessionRestore";

export type RootOutletContext = { connectionNotice: ReactNode };

// 单例 QueryClient：全局唯一，避免每次渲染重建缓存。默认项（staleTime 等）取自
// @tsz/shared 的 browserQueryDefaults，与 web 共用同一份，避免两处漂移。
bindAdminAuthorizationCache(useAuthStore, queryClient);

// 根布局 element：QueryClientProvider + antd ConfigProvider + 会话恢复，包住所有路由。
// 挂载时用 admin refresh cookie 静默恢复会话，写入 profile / level / hydrated。
// AntApp 提供 message/modal/notification 的 context 版（v6 起不建议再用静态方法）。
export function RootProviders({ children }: { children?: ReactNode }) {
  const { t } = useAdminTranslation();
  const isLoginPage = useMatch("/login") !== null;
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
  const localeReady = useAdminLocaleReady();
  const connectionNotice = !permissionModelIncompatible &&
    (connectionError || refreshUnconfirmed) && (
      <Alert
        className={isLoginPage ? "admin-login__connection" : undefined}
        role={isLoginPage ? "status" : "alert"}
        type={isLoginPage ? "info" : "warning"}
        icon={isLoginPage ? <UnplugIcon /> : undefined}
        showIcon
        title={
          isLoginPage
            ? refreshUnconfirmed
              ? t("recovery_login_pending")
              : retrying
                ? t("recovery_retrying")
                : t("recovery_unavailable")
            : refreshUnconfirmed
              ? t("recovery_uncertain")
              : hydrated
                ? t("recovery_disconnected")
                : t("recovery_connecting")
        }
        action={
          <Button
            type={isLoginPage ? "text" : "default"}
            danger={isLoginPage && !refreshUnconfirmed}
            loading={retrying}
            onClick={() =>
              refreshUnconfirmed
                ? window.location.assign("/login")
                : void retry()
            }
          >
            {refreshUnconfirmed
              ? t("recovery_sign_in")
              : isLoginPage
                ? t("recovery_retry")
                : t("recovery_retry_connection")}
          </Button>
        }
      />
    );
  if (!localeReady) return <AdminBootFallback />;
  return (
    <QueryClientProvider client={queryClient}>
      <>
        <RecoverySession />
        <FeedbackApp key={identity}>
          {permissionModelIncompatible && !isLoginPage && (
            <Alert type="error" showIcon title={t("auth_upgrade")} />
          )}
          {!isLoginPage && connectionNotice}
          {children ?? (
            <Outlet
              context={{ connectionNotice } satisfies RootOutletContext}
            />
          )}
        </FeedbackApp>
      </>
    </QueryClientProvider>
  );
}
