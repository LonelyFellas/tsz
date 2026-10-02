import {
  canAdminResourceAction,
  hasAdminPermission,
  hasAnyAdminPermission,
  type AdminPermissionActor
} from "@tsz/shared/auth";
export type EntryWriteActor = AdminPermissionActor;

/** 列表行与详情都提供归属；归属缺失时普通管理员失败关闭。 */
export interface WritableEntry {
  created_by?: string;
  published_revision?: number;
}
const EDIT_FORBIDDEN_CODE = "entry_edit_forbidden";
export function isEntryOwnershipError(code: string | undefined): boolean {
  return code === EDIT_FORBIDDEN_CODE;
}
export function canCreateEntry(
  actor: EntryWriteActor | null | undefined
): boolean {
  return hasAdminPermission(actor, "words.create");
}
export function canCheckEntry(
  actor: EntryWriteActor | null | undefined
): boolean {
  return hasAnyAdminPermission(actor, [
    "words.edit",
    "words.publish",
    "words.validate"
  ]);
}
export function canWriteEntry(
  actor: EntryWriteActor | null | undefined,
  entry?: WritableEntry
): boolean {
  return canAdminResourceAction(actor, "words", "edit", entry?.created_by);
}
export const ENTRY_WRITE_BLOCKED_HINT =
  "需要相应业务权限，普通管理员仅能操作本人内容；编辑他人内容需额外授权";
export function entryWriteForbiddenMessage(code: string | undefined): string {
  return isEntryOwnershipError(code)
    ? "没有编辑该归属词条的权限。"
    : "当前账号没有执行该操作的权限。";
}
export function canPublishEntry(
  actor: EntryWriteActor | null | undefined,
  entry: WritableEntry
): boolean {
  return canAdminResourceAction(actor, "words", "publish", entry.created_by);
}
export function canTransitionEntry(
  actor: EntryWriteActor | null | undefined,
  entry: WritableEntry,
  action: "archive" | "restore" = "archive"
): boolean {
  return canAdminResourceAction(actor, "words", action, entry.created_by);
}
export const ENTRY_PUBLISH_BLOCKED_HINT =
  "需要词条发布权限；普通管理员仅能发布本人词条";
