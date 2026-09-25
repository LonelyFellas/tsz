"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect } from "react";
import { getQueryClient } from "@/lib/query-client";
import { syncThemeToDom } from "@/lib/theme";
import { useSessionRestore } from "@/features/auth/hooks/useSessionRestore";
import { useUserStore } from "@/stores/user";

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
  const connectionError = useUserStore((s) => s.connectionError);
  const hydrated = useUserStore((s) => s.hydrated);
  useEffect(() => {
    window.dispatchEvent(new Event("tsz:app-ready"));
  }, []);
  if (!connectionError) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 top-4 z-50 mx-auto max-w-lg rounded-3xl border border-gray-200 bg-white p-4 text-center text-gray-900 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-white"
    >
      <p>
        {hydrated ? "连接暂时中断，当前内容已保留" : "暂时无法恢复会话，请重试"}
      </p>
      <button
        type="button"
        disabled={retrying}
        onClick={() => void retry()}
        className="mt-3 rounded-full bg-[#0071e3] px-5 py-2 text-white disabled:opacity-50"
      >
        {retrying ? "重试中…" : "重试连接"}
      </button>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  // getQueryClient 在浏览器端返回单例,不放进 useState 也安全。
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <SessionRestorer />
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
