import { useAdminTranslation } from "@/i18n";
import { useEffect } from "react";
import { isResourceError } from "@tsz/shared/recovery";
import { Button, Result, Space, Typography } from "@tsz/ui/admin/display";
import { useRouteError } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";

// 路由级错误兜底：任一已匹配路由在渲染/loader 中抛出未捕获错误时，react-router
// 会渲染最近的 errorElement（挂在根路由，见 router.tsx）。不做静默白屏，给出可读
// 提示与「刷新重试」，避免整页 shell 消失后用户无路可走。
export function RouteErrorPage() {
  const { t } = useAdminTranslation();
  const error = useRouteError();
  const resourceError = isResourceError(error);
  useEffect(() => {
    if (resourceError) window.dispatchEvent(new Event("tsz:resource-error"));
  }, [resourceError]);
  // 兜底页自己要能在「入口 chunk 加载失败」时渲染，所以挂在 RootProviders 之外；
  // 随之而来的是这里没有 ConfigProvider，需要就地补一个品牌主题，
  // 否则整页会退回 antd 默认蓝，与后台其余部分明显不同色。
  const message = resourceError
    ? t("error_resource_help")
    : t("error_page_help");
  // 便于截图/转述给运维定位；过长只截前 200 字符，避免撑破布局。
  const detail =
    error instanceof Error && error.message ? error.message.slice(0, 200) : "";

  return (
    <FullscreenCenter>
      <Result
        status="error"
        title={
          resourceError ? t("error_resource_title") : t("error_page_title")
        }
        subTitle={
          <>
            {message}
            {detail && (
              <Typography.Paragraph
                type="secondary"
                style={{
                  margin: "12px 0 0",
                  fontSize: 12,
                  wordBreak: "break-word"
                }}
              >
                {t("error_detail")}
                {detail}
              </Typography.Paragraph>
            )}
          </>
        }
        extra={
          <Space wrap size={12}>
            <Button type="primary" onClick={() => window.location.reload()}>
              {t("error_reload")}
            </Button>
            {/* 整页跳转：出错后 router 状态可能已不可靠，走新的入口更稳。 */}
            <Button onClick={() => window.location.assign("/")}>
              {t("error_home")}
            </Button>
          </Space>
        }
      />
    </FullscreenCenter>
  );
}
