import { useEffect } from "react";
import { isResourceError } from "@tsz/shared/recovery";
import { Button, ConfigProvider, Result, Space, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useRouteError } from "react-router-dom";
import { antdTheme } from "@/antd-theme";
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
  // 兜底页自己要能在「入口 chunk 加载失败」时渲染，所以挂在 RootProviders 之外；
  // 随之而来的是这里没有 ConfigProvider，需要就地补一个品牌主题，
  // 否则整页会退回 antd 默认蓝，与后台其余部分明显不同色。
  const message = resourceError
    ? "页面资源加载失败，请检查网络或刷新重试。编辑备份可在原页面恢复。"
    : "页面暂时无法显示，请刷新后重试。";
  // 便于截图/转述给运维定位；过长只截前 200 字符，避免撑破布局。
  const detail =
    error instanceof Error && error.message ? error.message.slice(0, 200) : "";

  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <FullscreenCenter>
        <Result
          status="error"
          title={resourceError ? "页面资源加载失败" : "页面出错了"}
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
                  错误信息：{detail}
                </Typography.Paragraph>
              )}
            </>
          }
          extra={
            <Space wrap size={12}>
              <Button type="primary" onClick={() => window.location.reload()}>
                刷新重试
              </Button>
              {/* 整页跳转：出错后 router 状态可能已不可靠，走新的入口更稳。 */}
              <Button onClick={() => window.location.assign("/")}>
                返回首页
              </Button>
            </Space>
          }
        />
      </FullscreenCenter>
    </ConfigProvider>
  );
}
