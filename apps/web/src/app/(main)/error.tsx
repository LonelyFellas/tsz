"use client";

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
          {resourceError ? "页面资源加载失败" : "页面暂时无法显示"}
        </h2>
        <p>
          {resourceError
            ? "请检查网络后重新加载；已备份的编辑内容可在原页面恢复。"
            : "重新加载即可继续；如果反复出现，请稍后再试。"}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {/* 资源已失效时 reset() 会再撞一次同一个 chunk,必须整页重载。 */}
          <Button
            onClick={resourceError ? () => window.location.reload() : reset}
          >
            {resourceError ? "重新加载" : "重试"}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">返回首页</Link>
          </Button>
        </div>
      </div>
    </PageNotice>
  );
}
