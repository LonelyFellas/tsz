// 个人设置：当前登录管理员自己的偏好，人人可访问（区别于「系统设置」下的平台级配置，
// 那些是 super_admin 专属）。入口只在顶栏头像菜单，不进侧栏——侧栏可见性由后端下发的
// 菜单权限 key 驱动，个人设置不需要也不应该占一个权限位。
import { Stack, Typography } from "@mui/material";
import { DialectPreference } from "@/features/settings/DialectPreference";

export function ProfileSettingsPage() {
  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="h5" style={{ margin: 0 }}>
        个人设置
      </Typography>
      <DialectPreference />
    </Stack>
  );
}
