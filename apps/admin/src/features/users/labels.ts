// 用户管理的展示映射（纯常量/纯函数，可单测）。
import type { Role } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { DISPLAY_NAME_MAX } from "@tsz/shared";

export const ROLE_LABEL: Record<Role, string> = {
  student: "学生",
  teacher: "老师",
  admin: "管理员"
};

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
 * 把用户管理写操作（启禁用 / 编辑）的后端错误映射为中文提示。契约里的四种错误：
 * 403 = 非超管（按钮本已置灰，这是第二道防线）；400 invalid_display_name = 昵称不合规
 *（只可能来自编辑，后端原文是英文，换成与弹窗预检同一套规则的中文）；
 * 404 = 用户不存在（可能被并发删）；422 = 请求体缺字段 / status 不在枚举内。
 * 其余错误回退后端原文（Error.message），再兜底 fallback。
 */
export function userActionError(err: unknown, fallback: string): string {
  if (err instanceof HttpError) {
    if (err.status === 403) return "需超级管理员权限";
    // 按稳定错误码判定而非匹配 message（文案可变、code 是契约）。
    if (err.code === "invalid_display_name") {
      return `昵称需 1–${DISPLAY_NAME_MAX} 字符，且不能包含 < > 或控制字符`;
    }
    if (err.status === 404) return "该用户不存在，可能已被删除";
    if (err.status === 422) return "请求参数不合法";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
