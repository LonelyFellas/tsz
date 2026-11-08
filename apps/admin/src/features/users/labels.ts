import {
  defaultUserTranslation,
  type UserTranslation,
  type UserMessageKey
} from "./messages";
// 用户管理的展示映射（纯常量/纯函数，可单测）。
import type { Role } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { DISPLAY_NAME_MAX } from "@tsz/shared";

const ROLE_MESSAGES: Record<Role, UserMessageKey> = {
  student: "role_student",
  teacher: "role_teacher",
  admin: "role_admin"
};
export function roleLabel(
  role: Role,
  t: UserTranslation = defaultUserTranslation
) {
  return t(ROLE_MESSAGES[role]);
}

export const ROLE_TAG_COLOR: Record<Role, string> = {
  student: "blue",
  teacher: "gold",
  admin: "purple"
};

/** CEFR 等级 → Tag 颜色（与 web 落地体系一致的柔和色系）。 */
export function levelColor(level: string): string {
  const map: Record<string, string> = {
    A1: "green",
    A2: "cyan",
    B1: "blue",
    B2: "geekblue",
    C1: "purple",
    C2: "magenta"
  };
  return map[level] ?? "default";
}

/**
 * 把用户管理写操作（启禁用 / 编辑）的已知后端错误映射为界面提示。契约里的四种错误：
 * 403 = 非超管（按钮本已置灰，这是第二道防线）；400 invalid_display_name = 昵称不合规
 *（只可能来自编辑，后端原文是英文，换成与弹窗预检同一套规则的界面提示）；
 * 404 = 用户不存在（可能被并发删）；422 = 请求体缺字段 / status 不在枚举内。
 * 其余错误回退后端原文（Error.message），再兜底 fallback。
 */
export function userActionError(
  err: unknown,
  fallback: string,
  t: UserTranslation = defaultUserTranslation
): string {
  if (err instanceof HttpError) {
    if (err.status === 403) return t("super_required");
    // 按稳定错误码判定而非匹配 message（文案可变、code 是契约）。
    if (err.code === "invalid_display_name") {
      return t("name_rule", { max: DISPLAY_NAME_MAX });
    }
    if (err.status === 404) return t("user_missing");
    if (err.status === 422) return t("invalid_request");
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
