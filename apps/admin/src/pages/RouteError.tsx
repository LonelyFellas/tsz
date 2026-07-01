import { Button } from "@tsz/ui/components";
import { useRouteError } from "react-router-dom";

// 路由级错误兜底：任一已匹配路由在渲染/loader 中抛出未捕获错误时，react-router
// 会渲染最近的 errorElement（挂在根路由，见 router.tsx）。不做静默白屏，给出可读
// 提示与「刷新重试」，避免整页 shell 消失后用户无路可走。
export function RouteErrorPage() {
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : "发生了未知错误，请稍后重试。";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">页面出错了</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button className="rounded-full" onClick={() => window.location.reload()}>
        刷新重试
      </Button>
    </div>
  );
}
