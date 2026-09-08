// 词条写操作的可用性判定。与 deletePermission / annotationPermission 同一套路：
// **这不是权限**——真正的归属校验在后端（越权返回 403 entry_edit_forbidden）。
// 前端判定的意义是让管理员在点击前就知道结果，而不是点下去再吃错误。
//
// 规则（2026-09-08 定盘）：草稿对所有管理员**可见**，但**从未发布**的草稿只有创建者
// 本人与超管能写。已发布词条（含带未发布修改的）不受限，全员可编辑——「草稿」只表示
// 尚未对 C 端发布，不表示私有。
import type { AdminWordListItemAny } from "@tsz/types";

export interface EntryWriteActor {
  id: string;
  role: string;
}

/** 判定只需要归属与「是否发布过」，列表行与详情都满足这个形状。 */
export interface WritableEntry {
  created_by?: string;
  /** 缺省即从未发布。与后端 `current_publication_id IS NULL` 同口径。 */
  published_revision?: number;
}

/** 后端对「非超管写他人未发布草稿」的业务 code。 */
const EDIT_FORBIDDEN_CODE = "entry_edit_forbidden";

/** 后端明说这个 403 是「动了别人的草稿」，而不是「压根没有这块权限」。 */
export function isEntryOwnershipError(code: string | undefined): boolean {
  return code === EDIT_FORBIDDEN_CODE;
}

/**
 * 能不能写这个词条。
 *
 * 判定顺序与后端 `ensure_draft_writable` 一致：超管 → 是否发布过 → 归属。
 *
 * **不要改用 `status === "draft"`**：归档了的草稿状态是 `archived`（归档优先于发布态），
 * 但它在后端眼里仍是「从未发布」，垃圾桶里恢复别人的草稿一样会被拒。
 * `published_revision` 才与后端的 `current_publication_id IS NULL` 同口径。
 */
export function canWriteEntry(
  actor: EntryWriteActor | undefined,
  entry: WritableEntry
): boolean {
  // 拿不到当前管理员身份就无法判定归属——保守不放行，与 deletePermission 一致。
  if (!actor) return false;
  if (actor.role === "super_admin") return true;
  if (entry.published_revision !== undefined) return true;
  return entry.created_by !== undefined && entry.created_by === actor.id;
}

/** 置灰时要给理由，否则管理员只看到一个不能点的按钮。 */
export const ENTRY_WRITE_BLOCKED_HINT = "只能修改自己创建的未发布草稿";

/**
 * 写操作失败里 403 的文案。归属越权与「账号没有这块权限」对管理员意味不同，
 * 统一说「操作失败」会让人以为是重试就能好的故障。
 * 拿不到具体 code 时退回同时成立的宽口径说法，不猜。
 */
export function entryWriteForbiddenMessage(code: string | undefined): string {
  return isEntryOwnershipError(code)
    ? "只能修改自己创建的未发布草稿。"
    : "当前账号没有执行该操作的权限。";
}

/** 批量入口：返回可提交的行与被挡下的行（供提交前拦截时列出）。 */
export function partitionWritableRows(
  actor: EntryWriteActor | undefined,
  rows: AdminWordListItemAny[]
): { writable: AdminWordListItemAny[]; blocked: AdminWordListItemAny[] } {
  const writable: AdminWordListItemAny[] = [];
  const blocked: AdminWordListItemAny[] = [];
  for (const row of rows) {
    if (canWriteEntry(actor, row)) {
      writable.push(row);
    } else {
      blocked.push(row);
    }
  }
  return { writable, blocked };
}
