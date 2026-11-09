"use client";

import { WebLocaleBoundary, useWebLocaleReady } from "@/i18n/boot";
import { WebLocaleEffects } from "@/i18n/effects";
import { useWebText } from "@/i18n/client";
import { webApp } from "@/i18n/messages/app";
import { QueryClientProvider } from "@tanstack/react-query";
import { InterfacePreferencesProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { interfacePreferences } from "@/lib/interface-preferences";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect } from "react";
import { getQueryClient } from "@/lib/query-client";
import { syncThemeToDom } from "@/lib/theme";
import { DailyLoginReward } from "@/features/coins/LoginReward";
import { useSessionRestore } from "@/features/auth/hooks/useSessionRestore";
import { useUserStore } from "@/stores/user";
import { PhoneBindingGuard } from "@/features/auth/components/PhoneBindingGuard";
import { NotificationTabBadge } from "@/features/teacher-certification/NotificationTabBadge";
import { TeacherIdentityProvider } from "@/features/teacher-certification/TeacherIdentityProvider";
import { clearUserPending } from "@/features/review/pending";

// 服务端无 layout effect;客户端用 layoutEffect 在 paint 前补主题 class。
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// 水合后重新把主题 class 写回 <html>。
// React 水合 <html> 时会剥掉前置脚本加的 .dark,这里在首个 layout 阶段补回,
// 既修正「视觉变浅但状态以为是深色」的脱节,又因在 paint 前执行而不闪。
function ThemeSync() {
  useIsoLayoutEffect(() => {
    syncThemeToDom();
  }, []);
  return null;
}

// devtools 仅开发环境按需动态加载，生产构建不渲染、其代码块不进主包。
const ReactQueryDevtools = dynamic(
  () =>
    import("@tanstack/react-query-devtools").then((m) => m.ReactQueryDevtools),
  { ssr: false }
);

function SessionRestorer() {
  const uiText = useWebText(webApp);
  const { retry, retrying } = useSessionRestore();
  const localeReady = useWebLocaleReady();
  const refreshUnconfirmed = useUserStore((s) => s.refreshUnconfirmed);
  const connectionError = useUserStore((s) => s.connectionError);
  const hydrated = useUserStore((s) => s.hydrated);
  useEffect(() => {
    window.dispatchEvent(new Event("tsz:app-ready"));
  }, []);
  if (!localeReady || (!connectionError && !refreshUnconfirmed)) return null;
  // 顶栏为 64px 高的 sticky z-50，提示需落在其下方并压过它，否则文字被遮住。
  return (
    <div
      role="alert"
      className="animate-in fixed inset-x-4 top-20 z-[60] mx-auto max-w-md rounded-3xl border border-border/60 bg-surface/90 px-6 py-5 text-center text-foreground shadow-float backdrop-blur-xl"
    >
      <p className="text-sm leading-6">
        {refreshUnconfirmed
          ? uiText(
              "webApp:could_not_confirm_the_session_refresh_sign_in_again_and_check_the_result"
            )
          : hydrated
            ? uiText(
                "webApp:connection_lost_your_content_is_preserved_reconnection_will_be_automatic"
              )
            : uiText(
                "webApp:reconnecting_work_will_resume_when_the_connection_returns"
              )}
      </p>
      <button
        type="button"
        disabled={retrying}
        onClick={() =>
          refreshUnconfirmed ? (window.location.href = "/login") : void retry()
        }
        className="mt-4 inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
      >
        {refreshUnconfirmed
          ? uiText("webApp:sign_in_again")
          : retrying
            ? uiText("webApp:retrying")
            : uiText("webApp:retry_connection")}
      </button>
    </div>
  );
}

export function Providers({
  children,
  initialLocale
}: {
  children: React.ReactNode;
  initialLocale: InterfaceLocale;
}) {
  const interfaceSessionKey = useUserStore(() =>
    interfacePreferences.sessionKey()
  );
  // getQueryClient 在浏览器端返回单例,不放进 useState 也安全。
  const queryClient = getQueryClient();
  useEffect(() => {
    const recovered = () => {
      if (useUserStore.getState().user)
        void queryClient.refetchQueries({
          type: "active",
          predicate: (query) => query.state.status === "error"
        });
    };
    window.addEventListener("tsz:session-recovered", recovered);
    return () => window.removeEventListener("tsz:session-recovered", recovered);
  }, [queryClient]);
  useEffect(
    () =>
      useUserStore.subscribe((state, previous) => {
        if (state.user?.id !== previous.user?.id) {
          void queryClient.cancelQueries({ queryKey: ["wordlists", "user"] });
          queryClient.removeQueries({ queryKey: ["wordlists", "user"] });
          void queryClient.cancelQueries({ queryKey: ["coins"] });
          queryClient.removeQueries({ queryKey: ["coins"] });
          void queryClient.cancelQueries({ queryKey: ["login-reward"] });
          queryClient.removeQueries({ queryKey: ["login-reward"] });
          void queryClient.cancelQueries({ queryKey: ["memory"] });
          queryClient.removeQueries({ queryKey: ["memory"] });
          void queryClient.cancelQueries({ queryKey: ["review"] });
          queryClient.removeQueries({ queryKey: ["review"] });
          if (previous.user) clearUserPending(previous.user.id);
        }
      }),
    [queryClient]
  );

  return (
    <InterfacePreferencesProvider
      controller={interfacePreferences}
      sessionKey={interfaceSessionKey}
      initialLocale={initialLocale}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeSync />
        <WebLocaleEffects />
        <SessionRestorer />
        <WebLocaleBoundary>
          <DailyLoginReward />
          <NotificationTabBadge />
          <PhoneBindingGuard>
            <TeacherIdentityProvider>{children}</TeacherIdentityProvider>
          </PhoneBindingGuard>
        </WebLocaleBoundary>
        {process.env.NODE_ENV === "development" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </InterfacePreferencesProvider>
  );
}
