// 角色治理的展示映射、校验与错误文案（纯常量/纯函数，可单测）。
import type { PermissionKey } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { DISPLAY_NAME_MAX, hasDisplayNameForbiddenChars } from "@tsz/shared";

/**
 * §8 权限落地状态：目录接口只返回 key + label、不含落地状态，前端据设计文档硬编码标注，
 * 供配置页把「未上线」的叶子标出来（勾进角色无害，但对应菜单落地前仍 todo 置灰）。
 * 待后端后续在目录里补 `landed` 字段后，删除本表改用后端下发。
 */
export const LANDED_PERMISSIONS: ReadonlySet<PermissionKey> =
  new Set<PermissionKey>([
    "users.access",
    "words.access",
    "wordlists.access",
    "reviews.access"
  ]);

export function isPermissionLanded(key: PermissionKey): boolean {
  return LANDED_PERMISSIONS.has(key);
}

/** 角色名长度上限（后端 1–50，与昵称同规则，复用同一常量避免漂移）。 */
export const ROLE_NAME_MAX = DISPLAY_NAME_MAX;
/** 角色描述长度上限（后端 ≤200）。 */
export const ROLE_DESC_MAX = 200;

/**
 * 角色名本地预检（挡掉 §3 名称非法类 400 的绝大多数，400 只作兜底）：
 * 去空白后非空、≤50 字符、不含 < > 或控制/不可见字符。合法返回 null，否则返回中文错误文案。
 */
export function validateRoleName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "请输入角色名";
  if ([...trimmed].length > ROLE_NAME_MAX) {
    return `角色名最长 ${ROLE_NAME_MAX} 字符`;
  }
  if (hasDisplayNameForbiddenChars(trimmed)) {
    return "角色名不能包含 < > 或控制字符";
  }
  return null;
}

/**
 * 唯一可据 `code` 精确处理的 400：勾了目录外的权限 key（本地 key 列表可能过期）。
 * 其余 400 一律展示后端 error 原文，不匹配英文文案（见 §3）。
 */
export function isUnknownPermissionKeyError(err: unknown): boolean {
  return err instanceof HttpError && err.code === "unknown_permission_key";
}

/** 通用错误文案：优先后端原文（Error.message），兜底 fallback。 */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * 把角色写操作（改/删/派）的后端错误映射为中文提示。
 * 403 = 系统角色只读 / 非超管 / 派给超管（均属兜底，UI 本就置灰或不渲染入口）；
 * 404 = 角色或管理员不存在（可能被并发删）。其余回退后端原文再兜底 fallback。
 * 注：409 重名与 400 unknown_permission_key 由调用方就地处理（字段标红 / 重拉目录），不走这里。
 */
export function roleMutationError(err: unknown, fallback: string): string {
  if (err instanceof HttpError) {
    if (err.status === 403) return "无权限执行此操作（系统角色或超管不可操作）";
    if (err.status === 404) return "角色或管理员不存在，可能已被删除";
  }
  return errorText(err, fallback);
}
