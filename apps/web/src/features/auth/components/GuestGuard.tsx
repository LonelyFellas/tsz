"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/user";

/**
 * 访客守卫（客户端）：已登录用户访问登录/注册页时自动跳走。
 * 未完成引导的用户跳 /onboarding，否则回首页。
 * 会话恢复完成前正常渲染表单，保证未登录用户即时看到登录页、不闪烁。
 */
export function GuestGuard({ children }: { children: ReactNode }) {
  const user = useUserStore((s) => s.user);
  const onboarded = useUserStore((s) => s.onboarded);
  const hydrated = useUserStore((s) => s.hydrated);
  const router = useRouter();

  const loggedIn = hydrated && !!user;

  useEffect(() => {
    if (loggedIn) {
      router.replace(onboarded === false ? "/onboarding" : "/");
    }
  }, [loggedIn, onboarded, router]);

  if (loggedIn) return null;

  return <>{children}</>;
}
