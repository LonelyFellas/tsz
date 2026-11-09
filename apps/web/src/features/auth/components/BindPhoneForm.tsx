"use client";
import { useWebText } from "@/i18n/client";
import { webAuthAccess as webAuth } from "@/i18n/messages/auth/access";

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
  const uiText = useWebText(webAuth);
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
        {uiText("webAuthAccess:bind_phone_number")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-foreground-muted">
        {uiText(
          "webAuthAccess:verify_and_bind_a_phone_number_before_continuing_you_can_then_sign_in_wi"
        )}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground-muted">
        {uiText(
          "webAuthAccess:you_will_need_to_sign_in_again_on_every_device_after_binding"
        )}
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
          {uiText("webAuthAccess:delete_account")}
        </Link>
      </div>
    </main>
  );
}
