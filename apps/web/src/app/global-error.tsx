"use client";
import { useWebText } from "@/i18n/client";
import { webApp } from "@/i18n/messages/app";

import { useEffect, useLayoutEffect } from "react";
import { InterfacePreferencesProvider } from "@tsz/shared/i18n/react";
import { interfacePreferences } from "@/lib/interface-preferences";
import { useUserStore } from "@/stores/user";
import { useSessionRestore } from "@/features/auth/hooks/useSessionRestore";
import { useWebLocaleReady } from "@/i18n/boot";
import { useWebLocale } from "@/i18n/client";

import { isResourceError } from "@tsz/shared/recovery";
import Link from "next/link";

// 捕获根 layout 自身的错误。必须是 client 组件,且自带 <html><body>
// (此时根 layout 已失效,无法复用)。仅在生产构建生效。
// 这里刻意不用 @tsz/ui:根 layout 已经失败,兜底页只用原生标签 + 语义色 class,
// 少一层依赖就少一个可能一起挂掉的 chunk。
type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError(props: GlobalErrorProps) {
  const sessionKey = useUserStore(() => interfacePreferences.sessionKey());
  return (
    <html suppressHydrationWarning>
      <body>
        <InterfacePreferencesProvider
          controller={interfacePreferences}
          sessionKey={sessionKey}
        >
          <GlobalErrorContent {...props} />
        </InterfacePreferencesProvider>
      </body>
    </html>
  );
}

function GlobalErrorContent({ error, reset }: GlobalErrorProps) {
  useSessionRestore();
  const ready = useWebLocaleReady();
  const locale = useWebLocale();
  const uiText = useWebText(webApp);
  const resourceError = isResourceError(error);
  useEffect(() => {
    if (resourceError) window.dispatchEvent(new Event("tsz:resource-error"));
  }, [resourceError]);
  useLayoutEffect(() => {
    if (ready) {
      document.documentElement.lang = locale;
      document.documentElement.setAttribute("data-interface-locale-ready", "");
    } else
      document.documentElement.removeAttribute("data-interface-locale-ready");
  }, [locale, ready]);
  if (!ready)
    return (
      <div
        role="status"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            border: "2px solid #d1d5db",
            borderTopColor: "#0071e3",
            borderRadius: "50%"
          }}
        />
        <a href="" aria-label="Reload / 重新加载" title="Reload / 重新加载">
          ↻
        </a>
      </div>
    );
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-muted text-primary [&_svg]:size-6">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 3.6 18.6 18H1.4L10 3.6Z" />
          <path d="M10 8.4v3.8" />
          <path d="M10 15h.01" />
        </svg>
      </span>
      <h1 className="text-xl font-semibold tracking-tight">
        {resourceError
          ? uiText("webApp:page_resources_could_not_be_loaded")
          : uiText("webApp:something_went_wrong")}
      </h1>
      <p className="text-sm leading-6 text-foreground-muted">
        {resourceError
          ? uiText(
              "webApp:check_your_connection_and_reload_backed_up_edits_can_be_restored_on_the"
            )
          : uiText("webApp:this_page_cannot_be_displayed_reload_and_try_again")}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={resourceError ? () => window.location.reload() : reset}
        >
          {resourceError ? uiText("webApp:reload") : uiText("webApp:retry")}
        </button>
        {/* 根 layout 已失败，这里用 Link 只是为了 href 语义：router 不存在时它会整页跳转。 */}
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-full px-5 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {uiText("webApp:go_to_home")}
        </Link>
      </div>
    </main>
  );
}
