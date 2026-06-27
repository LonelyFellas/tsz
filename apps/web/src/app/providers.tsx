"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { getQueryClient } from "@/lib/query-client";
import { useSessionRestore } from "@/features/auth/hooks/useSessionRestore";

// devtools 仅开发环境按需动态加载，生产构建不渲染、其代码块不进主包。
const ReactQueryDevtools = dynamic(
  () =>
    import("@tanstack/react-query-devtools").then((m) => m.ReactQueryDevtools),
  { ssr: false }
);

function SessionRestorer() {
  useSessionRestore();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // getQueryClient 在浏览器端返回单例,不放进 useState 也安全。
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <SessionRestorer />
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
