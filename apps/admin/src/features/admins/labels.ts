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

/** 管理员写操作的两条路径。403 在两条路径上语义相同（目标是超管）但文案要分开。 */
export type AdminActionKind = "status" | "reset";

const SUPER_ADMIN_FORBIDDEN: Record<AdminActionKind, string> = {
  status: "不能启禁用超级管理员",
  reset: "不能重置超级管理员的密码"
};

/**
 * 把管理员启禁用 / 重置密码的后端错误映射为中文提示。按真实契约：
 * 403 = 目标是 super_admin（含超管操作自己）——两条路径动作不同，故按 kind 取文案；
 * 页面入口已由 AdminsPage 守卫挡掉非超管，故此处 403 只会是「目标是超管」。
 * 404 = 目标管理员不存在（可能已被并发删除）；422 = 请求参数不合法（status 不在枚举内）。
 * 后端无 409（不存在「最后一个超管」这条规则）。其余错误回退后端原文，再兜底 fallback。
 */
export function adminActionError(
  err: unknown,
  kind: AdminActionKind,
  fallback: string
): string {
  if (err instanceof HttpError) {
    if (err.status === 403) return SUPER_ADMIN_FORBIDDEN[kind];
    if (err.status === 404) return "该管理员不存在，可能已被删除";
    if (err.status === 422) return "请求参数不合法";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
