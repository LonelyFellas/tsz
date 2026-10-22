"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserStore } from "@/stores/user";
import { phoneBindingRedirect } from "@tsz/shared/auth";
import { postAuthPath } from "../shared";

interface RouteGuardProps {
  children: ReactNode;
  /** 是否要求已完成新用户引导（onboarding）。主区页面传 true。 */
  requireOnboarding?: boolean;
  /** 工作区的目录、词表和编辑模式通过查询参数恢复。 */
  preserveSearch?: boolean;
}

/**
 * 受保护路由守卫（客户端）：
 * - 未登录 → 跳 /login?redirect=<当前路径>
 * - 已登录但未完成引导且页面要求引导 → 跳 /onboarding
 * 会话恢复完成（hydrated）前只显示加载态，避免把「恢复中」误判为「未登录」。
 */
export function RouteGuard({
  children,
  requireOnboarding = false,
  preserveSearch = false
}: RouteGuardProps) {
  const user = useUserStore((s) => s.user);
  const onboarded = useUserStore((s) => s.onboarded);
  const hydrated = useUserStore((s) => s.hydrated);
  const router = useRouter();
  const pathname = usePathname();

  const bindingTarget = hydrated ? phoneBindingRedirect(user, pathname) : null;
  const needsLogin = hydrated && !user;
  const needsOnboarding =
    hydrated && !!user && requireOnboarding && onboarded === false;

  useEffect(() => {
    const target = pathname + (preserveSearch ? window.location.search : "");
    if (needsLogin) {
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
    } else if (bindingTarget) {
      router.replace(phoneBindingRedirect(user, target) ?? bindingTarget);
    } else if (needsOnboarding) {
      router.replace(postAuthPath(false, target));
    }
  }, [
    needsLogin,
    bindingTarget,
    needsOnboarding,
    pathname,
    router,
    preserveSearch,
    user
  ]);

  // 恢复中或即将跳转：不渲染受保护内容。
  if (!hydrated || needsLogin || bindingTarget || needsOnboarding) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-foreground-subtle">
        加载中...
      </div>
    );
  }

  return <>{children}</>;
}
