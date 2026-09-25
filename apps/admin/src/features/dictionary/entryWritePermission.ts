export interface EntryWriteActor {
  id: string;
  role: string;
  can_publish_lexicon?: boolean;
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

export function canWriteEntry(
  actor: EntryWriteActor | null | undefined
): boolean {
  return actor?.role === "super_admin";
}

export const ENTRY_WRITE_BLOCKED_HINT = "当前账号仅有读取权限";

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

/** 发布权与编辑权独立；普通发布者仅能发布本人创建的词条草稿。 */
export function canPublishEntry(
  actor: EntryWriteActor | null | undefined,
  entry: WritableEntry
): boolean {
  return Boolean(
    actor &&
    (actor.role === "super_admin" ||
      (actor.can_publish_lexicon === true && entry.created_by === actor.id))
  );
}

export function canTransitionEntry(
  actor: EntryWriteActor | null | undefined,
  entry: WritableEntry
): boolean {
  return (
    canWriteEntry(actor) ||
    (entry.published_revision !== undefined &&
      actor?.can_publish_lexicon === true)
  );
}

export const ENTRY_PUBLISH_BLOCKED_HINT =
  "需要词库发布权限，且仅超管可以发布他人的草稿";
