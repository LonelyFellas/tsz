// 用户展示相关的轻量工具,供头像菜单 / 个人中心 / 编辑资料共用,避免散落重复。
import type { User } from "@tsz/types";

/** 昵称展示兜底:display_name 理论必有,仍防御运行时缺失/纯空格。 */
export function displayNameOf(
  user: Pick<User, "display_name">,
  fallback = "用户"
): string {
  return user.display_name?.trim() || fallback;
}
