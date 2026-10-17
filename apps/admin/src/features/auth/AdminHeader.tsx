import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import {
  Button,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Typography
} from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_LEVEL_LABEL } from "@/features/admins/labels";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthStore } from "@/lib/auth";
import { AdminAvatar } from "./adminAvatar";
import { useAdminLogout, useAdminLogoutAll } from "./useAdminLogout";

export function AdminHeader() {
  const profile = useAuthStore((s) => s.profile);
  const logout = useAdminLogout();
  const logoutAll = useAdminLogoutAll();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const name = profile?.display_name ?? "管理员";
  const roleLabel = (profile && ADMIN_LEVEL_LABEL[profile.role]) || "管理员";
  const go = (path: string) => {
    setAnchor(null);
    navigate(path);
  };
  return (
    <Stack
      direction="row"
      justifyContent="flex-end"
      alignItems="center"
      sx={{ height: "100%" }}
    >
      <Button
        aria-label="账户菜单"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(event) => setAnchor(event.currentTarget)}
        endIcon={<KeyboardArrowDown />}
      >
        <AdminAvatar level={profile?.role} size="small" />
      </Button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Stack direction="row" spacing={1} sx={{ px: 2, py: 1, width: 220 }}>
          <AdminAvatar level={profile?.role} />
          <div>
            <Typography fontWeight={600}>{name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {roleLabel}
            </Typography>
          </div>
        </Stack>
        <Divider />
        <MenuItem onClick={() => go("/settings/profile")}>个人设置</MenuItem>
        <MenuItem onClick={() => go("/account/coins")}>我的天生币</MenuItem>
        <MenuItem onClick={() => go("/change-password")}>修改密码</MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            setAnchor(null);
            void logout();
          }}
        >
          退出登录
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            setAnchor(null);
            setError(undefined);
            setConfirmation(true);
          }}
        >
          退出所有设备
        </MenuItem>
      </Menu>
      <ConfirmDialog
        open={confirmation}
        title="退出所有设备"
        confirmText="全部退出"
        danger
        pending={pending}
        error={error}
        onClose={() => setConfirmation(false)}
        onConfirm={() => {
          if (pending) return;
          setPending(true);
          setError(undefined);
          void logoutAll()
            .catch(() => setError("未能确认所有设备已退出，请重试。"))
            .finally(() => setPending(false));
        }}
      >
        将吊销你在全部设备上的登录会话，包括当前这台——确认后需要重新登录。确认退出？
      </ConfirmDialog>
    </Stack>
  );
}
