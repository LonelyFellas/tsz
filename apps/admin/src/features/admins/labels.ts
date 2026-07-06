// 管理员管理的展示映射与错误文案（纯常量/纯函数，可单测）。
import type { AdminLevel } from "@tsz/types";
import { HttpError } from "@tsz/api-client";

/** 权限等级 → 中文文案（列表 Tag / 详情共用）。 */
export const ADMIN_LEVEL_LABEL: Record<AdminLevel, string> = {
  admin: "普通管理员",
  super_admin: "超级管理员"
};

/** 权限等级下拉选项（新建弹窗与筛选栏共用，避免文案散落各处）。 */
export const ADMIN_LEVEL_OPTIONS: { label: string; value: AdminLevel }[] = [
  { label: ADMIN_LEVEL_LABEL.admin, value: "admin" },
  { label: ADMIN_LEVEL_LABEL.super_admin, value: "super_admin" }
];

/**
 * 把管理员启禁用 / 重置密码的后端错误映射为中文提示。
 * 已知状态码：409 = 禁用最后一个 active super_admin 被拒；403 = 目标是超管、不在此重置。
 * 其余错误回退到后端原文（Error.message），再兜底 fallback。
 */
export function adminActionError(err: unknown, fallback: string): string {
  if (err instanceof HttpError) {
    if (err.status === 409) return "不能禁用最后一个超级管理员";
    if (err.status === 403) return "不能重置超级管理员的密码";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
