import {
  UnplugIcon,
  ChevronDownIcon,
  LockKeyholeIcon,
  LogOutIcon,
  SettingsIcon
} from "lucide-react";
import { App, Popover } from "@tsz/ui/admin/overlays";
import { Button, Divider, Space, Typography } from "@tsz/ui/admin/display";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminText, useAdminTranslation } from "@/i18n";
import { useAuthStore } from "@/lib/auth";
import { AdminAvatar } from "./adminAvatar";
import { useAdminLogout, useAdminLogoutAll } from "./useAdminLogout";

/**
 * 后台顶栏内容：把身份与账户操作收进头像 Popover——顶栏只留一个头像，
 * 点开展开「已登录为 X」+ 修改密码 + 退出登录，供 ConsoleLayout 的 Layout.Header 承载。
 * 身份来自 store.profile —— 登录与会话恢复（useAdminSessionRestore）已写入，
 * 守卫保证进到这里时 profile 必有值，无需再单独探一次 /admin/profile。
 */
export function AdminHeader() {
  const { t } = useAdminTranslation();
  const { modal } = App.useApp();
  const profile = useAuthStore((s) => s.profile);
  const logout = useAdminLogout();
  const logoutAll = useAdminLogoutAll();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const name = profile?.display_name ?? t("account_admin");
  // 未映射的 role（后端将来新增等级、前端未跟上）回退「管理员」，不留空白角色行。
  const roleLabel = t(
    profile?.role === "super_admin"
      ? "account_super_admin"
      : profile?.role === "admin"
        ? "account_standard_admin"
        : "account_admin"
  );

  // 选一项后先收起 Popover，再执行动作（改密/个人设置走 SPA 导航，登出走整页跳转）。
  const goProfileSettings = () => {
    setOpen(false);
    navigate("/settings/profile");
  };
  const goChangePassword = () => {
    setOpen(false);
    navigate("/change-password");
  };
  const doLogout = () => {
    setOpen(false);
    void logout();
  };
  // 「退出所有设备」会把当前这台一起踢下线，误点代价高：二次确认。
  const doLogoutAll = () => {
    setOpen(false);
    const confirmation = modal.confirm({
      title: <AdminText message="account_sign_out_all" />,
      content: <AdminText message="account_sign_out_all_confirm" />,
      okText: <AdminText message="account_confirm_sign_out_all" />,
      okButtonProps: { danger: true },
      // 使用 close 回调自行收尾，避免 antd 再次抛出拒绝的 Promise。
      onOk: (close: () => void) => {
        confirmation.update({ okButtonProps: { danger: true, loading: true } });
        void logoutAll().then(close, () => {
          confirmation.update({
            content: (
              <Typography.Text type="danger" role="alert">
                <AdminText message="account_sign_out_all_failed" />
              </Typography.Text>
            ),
            okButtonProps: { danger: true, loading: false }
          });
        });
      }
    });
  };

  const menu = (
    <div style={{ width: 220 }}>
      <Space align="center" style={{ padding: "4px 4px 12px" }}>
        <AdminAvatar level={profile?.role} />
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
          icon={<SettingsIcon />}
          style={{ justifyContent: "flex-start" }}
          onClick={goProfileSettings}
        >
          {t("account_settings")}
        </Button>
        <Button
          type="text"
          block
          icon={<LockKeyholeIcon />}
          style={{ justifyContent: "flex-start" }}
          onClick={goChangePassword}
        >
          {t("account_change_password")}
        </Button>
        <Button
          type="text"
          block
          danger
          icon={<LogOutIcon />}
          style={{ justifyContent: "flex-start" }}
          onClick={doLogout}
        >
          {t("account_sign_out")}
        </Button>
        <Button
          type="text"
          block
          danger
          icon={<UnplugIcon />}
          style={{ justifyContent: "flex-start" }}
          onClick={doLogoutAll}
        >
          {t("account_sign_out_all")}
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
          aria-label={t("account_menu")}
          style={{ height: "auto", padding: "4px 8px" }}
        >
          <Space size={8}>
            <AdminAvatar level={profile?.role} size="small" />
            <ChevronDownIcon style={{ fontSize: 12, color: "#8c8c8c" }} />
          </Space>
        </Button>
      </Popover>
    </div>
  );
}
