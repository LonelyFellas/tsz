import { useEffect } from "react";
import { isResourceError } from "@tsz/shared/recovery";
import { Button, Stack, Typography } from "@mui/material";
import { useRouteError } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";

// 路由级错误兜底：任一已匹配路由在渲染/loader 中抛出未捕获错误时，react-router
// 会渲染最近的 errorElement（挂在根路由，见 router.tsx）。不做静默白屏，给出可读
// 提示与「刷新重试」，避免整页 shell 消失后用户无路可走。
export function RouteErrorPage() {
  const error = useRouteError();
  const resourceError = isResourceError(error);
  useEffect(() => {
    if (resourceError) window.dispatchEvent(new Event("tsz:resource-error"));
  }, [resourceError]);
  // 根入口的 MUI 主题覆盖路由错误边界。
  const message = resourceError
    ? "页面资源加载失败，请检查网络或刷新重试。编辑备份可在原页面恢复。"
    : "页面暂时无法显示，请刷新后重试。";
  // 便于截图/转述给运维定位；过长只截前 200 字符，避免撑破布局。
  const detail =
    error instanceof Error && error.message ? error.message.slice(0, 200) : "";

  return (
    <FullscreenCenter>
      <Stack spacing={2} sx={{ maxWidth: 640, p: 3 }}>
        <Typography variant="h4">
          {resourceError ? "页面资源加载失败" : "页面出错了"}
        </Typography>
        <Typography>{message}</Typography>
        {detail && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ overflowWrap: "anywhere" }}
          >
            错误信息：{detail}
          </Typography>
        )}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            刷新重试
          </Button>
          <Button onClick={() => window.location.assign("/")}>返回首页</Button>
        </Stack>
      </Stack>
    </FullscreenCenter>
  );
}
