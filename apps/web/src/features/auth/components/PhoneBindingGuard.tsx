"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { phoneBindingPath, phoneBindingRedirect } from "@tsz/shared/auth";
import { useUserStore } from "@/stores/user";

/** 恢复旧会话后同样强制补绑；阻止业务组件发起请求。 */
export function PhoneBindingGuard({ children }: { children: ReactNode }) {
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
  const pathname = usePathname();
  const router = useRouter();
  const target = hydrated ? phoneBindingRedirect(user, pathname) : null;
  useEffect(() => {
    if (target) {
      router.replace(
        phoneBindingPath(
          `${pathname}${window.location.search}${window.location.hash}`
        )
      );
    }
  }, [target, pathname, router]);
  if (target)
    return (
      <p role="status" className="py-20 text-center text-foreground-muted">
        正在前往手机号绑定…
      </p>
    );
  return children;
}
