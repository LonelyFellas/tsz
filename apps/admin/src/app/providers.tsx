"use client";

import { useSessionRestore } from "@tsz/shared/auth";
import { authRuntime } from "@/lib/auth";

// 应用挂载时用 refresh cookie 静默恢复会话，写入 user / activeRole / hydrated。
function SessionRestorer() {
  useSessionRestore(authRuntime);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionRestorer />
      {children}
    </>
  );
}
