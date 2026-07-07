// 用户管理的展示映射（纯常量/纯函数，可单测）。
import type { Role } from "@tsz/types";
import { HttpError } from "@tsz/api-client";

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
 * 把用户管理写操作（启禁用 / 编辑）的后端错误映射为中文提示。
 * 写操作后端限 super_admin：普通 admin（或本地 level 已过期、按钮置灰失效时）触发
 * 403 super admin required——映射为中文，与 admins/labels.ts 的 adminActionError 对齐，
 * 不把后端英文原文直接抛给用户。其余错误回退后端原文（Error.message），再兜底 fallback。
 */
export function userActionError(err: unknown, fallback: string): string {
  if (err instanceof HttpError && err.status === 403) {
    return "需超级管理员权限";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
