"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { safeRedirectPath } from "@tsz/shared/auth";
import { useUserStore } from "@/stores/user";
import { clearSession } from "@/lib/request";
import { postAuthPath } from "../shared";
import { ContactForm } from "./AccountSecurity";
import { LogoutButton } from "./LogoutButton";

export function BindPhoneForm() {
  const user = useUserStore((s) => s.user);
  const onboarded = useUserStore((s) => s.onboarded);
  const router = useRouter();
  const params = useSearchParams();
  const redirect = safeRedirectPath(params.get("redirect"));
  useEffect(() => {
    if (user?.phone && onboarded !== null)
      router.replace(postAuthPath(onboarded, redirect, user.roles));
  }, [user, onboarded, redirect, router]);
  if (!user || user.phone) return null;
  return (
    <main className="animate-in mx-auto max-w-xl px-6 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        绑定手机号
      </h1>
      <p className="mt-3 text-sm leading-6 text-foreground-muted">
        使用前需验证并绑定手机号。完成后，可使用手机号验证码登录；你的邮箱和账号资料会保留。
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground-muted">
        绑定后，所有设备需重新登录。
      </p>
      <div className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-8">
        <ContactForm
          user={user}
          action={{ channel: "phone", operation: "bind" }}
          onSuccess={() => {
            clearSession();
            const query = new URLSearchParams({ security: "success" });
            if (redirect !== "/") query.set("redirect", redirect);
            window.location.replace(`/login?${query}`);
          }}
        />
      </div>
      <div className="mt-6 flex items-center justify-between text-sm">
        <LogoutButton />
        <Link
          href="/account/delete"
          className="text-foreground-muted hover:text-foreground"
        >
          注销账号
        </Link>
      </div>
    </main>
  );
}
