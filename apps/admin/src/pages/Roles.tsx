import { useAccessTranslation } from "@/features/permissions/i18n";
// 用户管理 → 角色权限管理（RBAC 角色治理，super_admin 专属）。
// 入口已在侧栏按 level 隐藏；此处再加一层页面守卫做纵深防御（普通 admin 直敲 /roles 也拦住）。
import { Button, Result } from "@tsz/ui/admin/display";
import { useNavigate } from "react-router-dom";
import { RoleManagement } from "@/features/roles/RoleManagement";
import { useIsSuperAdmin } from "@/lib/auth";

export function RolesPage() {
  const { t } = useAccessTranslation();
  const isSuperAdmin = useIsSuperAdmin();
  const navigate = useNavigate();

  if (!isSuperAdmin) {
    return (
      <Result
        status="403"
        title={t("access_denied")}
        subTitle={t(
          "only_super_administrators_can_manage_roles_and_permissions"
        )}
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            {t("back_to_dashboard")}
          </Button>
        }
      />
    );
  }

  return <RoleManagement />;
}
