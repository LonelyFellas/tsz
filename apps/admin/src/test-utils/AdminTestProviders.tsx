import { AdminThemeProvider } from "@/mui-theme";
import { FeedbackProvider } from "@/components/FeedbackProvider";
import type { PropsWithChildren } from "react";

/** 与应用一致的展示/反馈边界；路由与 Query fixture 由各测试显式提供。 */
export function AdminTestProviders({ children }: PropsWithChildren) {
  return (
    <AdminThemeProvider>
      <FeedbackProvider>{children}</FeedbackProvider>
    </AdminThemeProvider>
  );
}
