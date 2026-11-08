import { useAdminTranslation } from "@/i18n";
import { Result } from "@tsz/ui/admin/display";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "@/lib/auth";
import { canVisitAdminRoute } from "@/lib/adminPageRoutes";

export { canVisitAdminRoute } from "@/lib/adminPageRoutes";

/** 在业务组件（包括其 Query hooks）挂载前守卫；撤权后立即卸载整个业务子树。 */
export function BusinessPermissionGuard({ children }: { children: ReactNode }) {
  const { t } = useAdminTranslation();
  const { pathname } = useLocation();
  const profile = useAuthStore((s) => s.profile);
  return canVisitAdminRoute(profile, pathname) ? (
    children
  ) : (
    <Result
      status="403"
      title={t("error_permission_title")}
      subTitle={t("error_permission_help")}
    />
  );
}
