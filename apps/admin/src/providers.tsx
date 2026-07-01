import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { browserQueryDefaults } from "@tsz/shared";
import { Outlet } from "react-router-dom";
import { useAdminSessionRestore } from "@/features/auth/hooks/useAdminSessionRestore";

// 单例 QueryClient：全局唯一，避免每次渲染重建缓存。默认项（staleTime 等）取自
// @tsz/shared 的 browserQueryDefaults，与 web 共用同一份，避免两处漂移。
const queryClient = new QueryClient({ defaultOptions: browserQueryDefaults });

// 根布局 element：QueryClientProvider + 会话恢复，包住所有路由（登录页与后台壳）。
// 挂载时用 admin refresh cookie 静默恢复会话，写入 profile / level / hydrated。
export function RootProviders() {
  useAdminSessionRestore();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
