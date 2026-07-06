// 用户管理 → 管理员管理（后台管理员账号，super_admin 专属）。
// 入口已在侧栏按 level 隐藏；此处再加一层页面守卫做纵深防御（普通 admin 直敲 /admins 也拦住）。
import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import { AdminManagement } from "@/features/admins/AdminManagement";
import { useAuthStore } from "@/lib/auth";

export function AdminsPage() {
  const level = useAuthStore((s) => s.profile?.level);
  const navigate = useNavigate();

  if (level !== "super_admin") {
    return (
      <Result
        status="403"
        title="无权限"
        subTitle="管理员管理仅超级管理员可访问。"
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            返回首页
          </Button>
        }
      />
    );
  }

  return <AdminManagement />;
}
