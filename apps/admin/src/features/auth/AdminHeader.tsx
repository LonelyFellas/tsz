import { LogoutOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import { useAuthStore } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";

/**
 * 后台顶栏内容：渲染「已登录为 X」+ 登出，供 ConsoleLayout 的 Layout.Header 承载。
 * 身份来自 store.profile —— 登录与会话恢复（useAdminSessionRestore）已写入，
 * 守卫保证进到这里时 profile 必有值，无需再单独探一次 /admin/profile。
 */
export function AdminHeader() {
  const profile = useAuthStore((s) => s.profile);
  const logout = useAdminLogout();

  const name = profile?.display_name ?? "管理员";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 16,
        height: "100%"
      }}
    >
      <Typography.Text type="secondary">
        已登录为 <Typography.Text strong>{name}</Typography.Text>
      </Typography.Text>
      <Space>
        <Button icon={<LogoutOutlined />} onClick={() => void logout()}>
          退出登录
        </Button>
      </Space>
    </div>
  );
}
