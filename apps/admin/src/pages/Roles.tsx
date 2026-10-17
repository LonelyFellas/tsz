// 用户管理 → 角色权限管理（RBAC 角色治理，super_admin 专属）。
// 入口已在侧栏按 level 隐藏；此处再加一层页面守卫做纵深防御（普通 admin 直敲 /roles 也拦住）。
import { Button } from "@mui/material";
import { PageStatus } from "@/components/PageStatus";
import { useNavigate } from "react-router-dom";
import { RoleManagement } from "@/features/roles/RoleManagement";
import { useIsSuperAdmin } from "@/lib/auth";

export function RolesPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const navigate = useNavigate();

  if (!isSuperAdmin) {
    return (
      <PageStatus
        title="无权限"
        description="角色权限管理仅超级管理员可访问。"
        action={
          <Button variant="contained" onClick={() => navigate("/")}>
            返回首页
          </Button>
        }
      />
    );
  }

  return <RoleManagement />;
}
