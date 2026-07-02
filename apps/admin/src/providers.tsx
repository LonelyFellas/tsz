import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { browserQueryDefaults } from "@tsz/shared";
import { App as AntApp, ConfigProvider, theme as antTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Outlet } from "react-router-dom";
import { useAdminSessionRestore } from "@/features/auth/hooks/useAdminSessionRestore";

// 单例 QueryClient：全局唯一，避免每次渲染重建缓存。默认项（staleTime 等）取自
// @tsz/shared 的 browserQueryDefaults，与 web 共用同一份，避免两处漂移。
const queryClient = new QueryClient({ defaultOptions: browserQueryDefaults });

// antd 全局主题：品牌蓝 #0071e3 + 略圆角，与登陆页设计体系保持一致。
// locale=zh_CN 让分页、表格空态、日期选择器等内建文案走中文。
const antdTheme = {
  algorithm: antTheme.defaultAlgorithm,
  token: {
    colorPrimary: "#0071e3",
    borderRadius: 8,
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
  }
};

// 根布局 element：QueryClientProvider + antd ConfigProvider + 会话恢复，包住所有路由。
// 挂载时用 admin refresh cookie 静默恢复会话，写入 profile / level / hydrated。
// AntApp 提供 message/modal/notification 的 context 版（v6 起不建议再用静态方法）。
export function RootProviders() {
  useAdminSessionRestore();
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN} theme={antdTheme}>
        <AntApp>
          <Outlet />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
