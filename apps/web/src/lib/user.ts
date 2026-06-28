// 用户展示相关的轻量工具,供头像菜单 / 个人中心 / 编辑资料共用,避免散落重复。
import type { EnglishVariant } from "@tsz/api-client";
import type { User } from "@tsz/types";

/** 昵称展示兜底:display_name 理论必有,仍防御运行时缺失/纯空格。 */
export function displayNameOf(user: Pick<User, "display_name">): string {
  return user.display_name?.trim() || "用户";
}

/** 英式 / 美式口音的中文标签。 */
export const VARIANT_LABEL: Record<EnglishVariant, string> = {
  BrE: "英式",
  AmE: "美式"
};
