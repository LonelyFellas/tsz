"use client";

import { useEffect } from "react";
import { isResourceError } from "@tsz/shared/recovery";

import { Button } from "@tsz/ui";

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
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h2 className="text-lg font-bold">加载失败</h2>
      <p className="text-sm text-foreground-muted">{error.message}</p>
      <Button onClick={reset}>重试</Button>
    </div>
  );
}
