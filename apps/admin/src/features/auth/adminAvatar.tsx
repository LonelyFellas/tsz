import { CrownOutlined, UserOutlined } from "@ant-design/icons";
import type { AvatarProps } from "antd";
import { Avatar } from "antd";
import type { AdminLevel } from "@tsz/types";
import type { ReactNode } from "react";

// 后端无头像字段：按权限等级给一套前端静态默认头像。
// super_admin → 金色皇冠；admin → 品牌蓝用户图标。图标 + 底色即角色标识。
interface AdminAvatarStyle {
  icon: ReactNode;
  background: string;
}

const AVATAR_BY_LEVEL: Record<AdminLevel, AdminAvatarStyle> = {
  super_admin: { icon: <CrownOutlined />, background: "#faad14" },
  admin: { icon: <UserOutlined />, background: "#0071e3" }
};

/**
 * 权限等级 → 默认头像样式。level 缺省（理论上守卫后 profile 必有值）回退普通管理员。
 * 纯函数，便于单测。
 */
export function adminAvatarStyle(level?: AdminLevel): AdminAvatarStyle {
  return AVATAR_BY_LEVEL[level ?? "admin"];
}

interface AdminAvatarProps {
  level?: AdminLevel;
  size?: AvatarProps["size"];
}

/** 按权限等级渲染默认头像（前端静态，无后端字段）。 */
export function AdminAvatar({ level, size }: AdminAvatarProps) {
  const { icon, background } = adminAvatarStyle(level);
  return (
    <Avatar size={size} icon={icon} style={{ backgroundColor: background }} />
  );
}
