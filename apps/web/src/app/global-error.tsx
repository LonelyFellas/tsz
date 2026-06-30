"use client";

// 捕获根 layout 自身的错误。必须是 client 组件,且自带 <html><body>
// (此时根 layout 已失效,无法复用)。仅在生产构建生效。
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <h1 className="text-xl font-bold">页面出错了</h1>
        <p className="text-sm text-foreground-muted">{error.message}</p>
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={reset}
        >
          重试
        </button>
      </body>
    </html>
  );
}
