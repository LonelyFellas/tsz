"use client";

import { QueryClientProvider } from "@tanstack/react-query";
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
  const { retry, retrying } = useSessionRestore();
  const refreshUnconfirmed = useUserStore((s) => s.refreshUnconfirmed);
  const connectionError = useUserStore((s) => s.connectionError);
  const hydrated = useUserStore((s) => s.hydrated);
  useEffect(() => {
    window.dispatchEvent(new Event("tsz:app-ready"));
  }, []);
  if (!connectionError && !refreshUnconfirmed) return null;
  // 顶栏为 64px 高的 sticky z-50，提示需落在其下方并压过它，否则文字被遮住。
  return (
    <div
      role="alert"
      className="animate-in fixed inset-x-4 top-20 z-[60] mx-auto max-w-md rounded-3xl border border-border/60 bg-surface/90 px-6 py-5 text-center text-foreground shadow-float backdrop-blur-xl"
    >
      <p className="text-sm leading-6">
        {refreshUnconfirmed
          ? "会话刷新结果尚未确认，请重新登录；当前操作请先查看结果"
          : hydrated
            ? "连接暂时中断，联网后将自动恢复；当前内容已保留"
            : "正在恢复连接，联网后将自动继续"}
      </p>
      <button
        type="button"
        disabled={retrying}
        onClick={() =>
          refreshUnconfirmed ? (window.location.href = "/login") : void retry()
        }
        className="mt-4 inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
      >
        {refreshUnconfirmed ? "重新登录" : retrying ? "重试中…" : "重试连接"}
      </button>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
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
        }
      }),
    [queryClient]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <SessionRestorer />
      <DailyLoginReward />
      <NotificationTabBadge />
      <PhoneBindingGuard>
        <TeacherIdentityProvider>{children}</TeacherIdentityProvider>
      </PhoneBindingGuard>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
