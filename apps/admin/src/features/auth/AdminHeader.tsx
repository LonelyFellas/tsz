import { DownOutlined, LockOutlined, LogoutOutlined } from "@ant-design/icons";
import { Button, Divider, Popover, Space, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_LEVEL_LABEL } from "@/features/admins/labels";
import { useAuthStore } from "@/lib/auth";
import { AdminAvatar } from "./adminAvatar";
import { useAdminLogout } from "./useAdminLogout";

/**
 * 后台顶栏内容：把身份与账户操作收进头像 Popover——顶栏只留一个头像，
 * 点开展开「已登录为 X」+ 修改密码 + 退出登录，供 ConsoleLayout 的 Layout.Header 承载。
 * 身份来自 store.profile —— 登录与会话恢复（useAdminSessionRestore）已写入，
 * 守卫保证进到这里时 profile 必有值，无需再单独探一次 /admin/profile。
 */
export function AdminHeader() {
  const profile = useAuthStore((s) => s.profile);
  const logout = useAdminLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const name = profile?.display_name ?? "管理员";
  // 未映射的 level（后端将来新增等级、前端未跟上）回退「管理员」，不留空白角色行。
  const roleLabel = (profile && ADMIN_LEVEL_LABEL[profile.level]) || "管理员";

  // 选一项后先收起 Popover，再执行动作（改密走 SPA 导航，登出走整页跳转）。
  const goChangePassword = () => {
    setOpen(false);
    navigate("/change-password");
  };
  const doLogout = () => {
    setOpen(false);
    void logout();
  };

  const menu = (
    <div style={{ width: 220 }}>
      <Space align="center" style={{ padding: "4px 4px 12px" }}>
        <AdminAvatar level={profile?.level} />
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong ellipsis style={{ display: "block" }}>
            {name}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {roleLabel}
          </Typography.Text>
        </div>
      </Space>
      <Divider style={{ margin: 0 }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          paddingTop: 8
        }}
      >
        <Button
          type="text"
          block
          icon={<LockOutlined />}
          style={{ justifyContent: "flex-start" }}
          onClick={goChangePassword}
        >
          修改密码
        </Button>
        <Button
          type="text"
          block
          danger
          icon={<LogoutOutlined />}
          style={{ justifyContent: "flex-start" }}
          onClick={doLogout}
        >
          退出登录
        </Button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        height: "100%"
      }}
    >
      <Popover
        trigger="click"
        placement="bottomRight"
        open={open}
        onOpenChange={setOpen}
        content={menu}
      >
        <Button
          type="text"
          aria-label="账户菜单"
          style={{ height: "auto", padding: "4px 8px" }}
        >
          <Space size={8}>
            <AdminAvatar level={profile?.level} size="small" />
            <DownOutlined style={{ fontSize: 12, color: "#8c8c8c" }} />
          </Space>
        </Button>
      </Popover>
    </div>
  );
}
