import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "@/lib/auth";
import { canVisitAdminRoute } from "@/lib/adminPageRoutes";

export { canVisitAdminRoute } from "@/lib/adminPageRoutes";

/** 在业务组件（包括其 Query hooks）挂载前守卫；撤权后立即卸载整个业务子树。 */
export function BusinessPermissionGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const profile = useAuthStore((s) => s.profile);
  return canVisitAdminRoute(profile, pathname) ? (
    children
  ) : (
    <Stack spacing={1} sx={{ p: 4 }} role="alert">
      <Typography variant="h5">没有访问权限</Typography>
      <Typography>
        请联系超级管理员开通权限。你仍可查看首页和个人设置。
      </Typography>
    </Stack>
  );
}
