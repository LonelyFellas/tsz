"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUserStore } from "@/stores/user";
import { postAuthPath } from "../shared";

function AuthRedirect({ onboarded }: { onboarded: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = postAuthPath(onboarded, searchParams.get("redirect"));

  useEffect(() => {
    router.replace(target);
  }, [target, router]);

  return null;
}

/**
 * 认证页统一导航：既处理恢复的已有会话，也处理登录/注册刚建立的会话。
 * 资料准备完整后，新用户去引导页，老用户去安全的回跳目标。
 * 仅导航分支读取查询参数，访客表单保留服务端渲染，不等待 JavaScript。
 */
export function GuestGuard({ children }: { children: ReactNode }) {
  const user = useUserStore((s) => s.user);
  const onboarded = useUserStore((s) => s.onboarded);
  const hydrated = useUserStore((s) => s.hydrated);

  if (hydrated && user && onboarded !== null) {
    return (
      <Suspense fallback={null}>
        <AuthRedirect onboarded={onboarded} />
      </Suspense>
    );
  }

  return <>{children}</>;
}
