"use client";
import { useWebText } from "@/i18n/client";
import { webApp } from "@/i18n/messages/app";

import { useEffect } from "react";
import { isResourceError } from "@tsz/shared/recovery";

import { Button } from "@tsz/ui/components";
import Link from "next/link";
import { PageNotice } from "@/features/shell/Page";

// 捕获 (main) 分组内的渲染错误。只覆盖同级及以下,不捕获自身 layout 的错误
// (那是 global-error 的职责)。
export default function MainError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const uiText = useWebText(webApp);
  const resourceError = isResourceError(error);
  useEffect(() => {
    if (resourceError) window.dispatchEvent(new Event("tsz:resource-error"));
  }, [resourceError]);
  return (
    <PageNotice tone="error">
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-muted text-primary [&_svg]:size-5">
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
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {resourceError
            ? uiText("webApp:page_resources_could_not_be_loaded")
            : uiText("webApp:this_page_cannot_be_displayed")}
        </h2>
        <p>
          {resourceError
            ? uiText(
                "webApp:check_your_connection_and_reload_backed_up_edits_can_be_restored_on_the"
              )
            : uiText(
                "webApp:reload_to_continue_if_the_problem_persists_try_again_later"
              )}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {/* 资源已失效时 reset() 会再撞一次同一个 chunk,必须整页重载。 */}
          <Button
            onClick={resourceError ? () => window.location.reload() : reset}
          >
            {resourceError ? uiText("webApp:reload") : uiText("webApp:retry")}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">{uiText("webApp:go_to_home")}</Link>
          </Button>
        </div>
      </div>
    </PageNotice>
  );
}
