"use client";

import { useAdminSessionRestore } from "@/features/auth/hooks/useAdminSessionRestore";

// 应用挂载时用 admin refresh cookie 静默恢复会话，写入 profile / level / hydrated。
function SessionRestorer() {
  useAdminSessionRestore();
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
