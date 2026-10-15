"use client";

import { useEffect } from "react";
import { isResourceError } from "@tsz/shared/recovery";
import Link from "next/link";

// 捕获根 layout 自身的错误。必须是 client 组件,且自带 <html><body>
// (此时根 layout 已失效,无法复用)。仅在生产构建生效。
// 这里刻意不用 @tsz/ui:根 layout 已经失败,兜底页只用原生标签 + 语义色 class,
// 少一层依赖就少一个可能一起挂掉的 chunk。
export default function GlobalError({
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
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
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
          {resourceError ? "页面资源加载失败" : "页面出错了"}
        </h1>
        <p className="text-sm leading-6 text-foreground-muted">
          {resourceError
            ? "请检查网络后重新加载；已备份的编辑内容可在原页面恢复。"
            : "页面暂时无法显示，请刷新后重试。"}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={resourceError ? () => window.location.reload() : reset}
          >
            重新加载
          </button>
          {/* 根 layout 已失败，这里用 Link 只是为了 href 语义：router 不存在时它会整页跳转。 */}
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-full px-5 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            返回首页
          </Link>
        </div>
      </body>
    </html>
  );
}
