// 垃圾桶「永久删除」的可用性判定。
// 这里只决定 UI 上按钮是否可点、以及不可点时说什么——**它不是权限**：
// 真正的归属校验在后端（越权返回 403 entry_delete_forbidden）。
// 前端判定的意义是让管理员在点击前就知道结果，而不是点下去再吃错误。
import type { AdminWordListItemAny } from "@tsz/types";

export type DeleteBlockReason =
  /** 不在垃圾桶里：永久删除只从垃圾桶发起，避免误删在编条目。 */
  | "not_archived"
  /** 发布过：publication 历史必须保留，后端一律拒绝。 */
  | "published"
  /** 非本人创建，且当前不是超管。 */
  | "not_owner"
  /** 拿不到当前管理员身份，无法判定归属——保守不放行。 */
  | "unknown_identity"
  /** 行上缺少乐观锁字段，无法安全提交。 */
  | "missing_revision";

export interface DeleteEligibility {
  deletable: boolean;
  reason?: DeleteBlockReason;
}

export interface DeleteActor {
  id: string;
  role: string;
}

export const DELETE_BLOCK_REASON_TEXT: Record<DeleteBlockReason, string> = {
  not_archived: "只有垃圾桶中的词条可以永久删除",
  published: "该词条已发布过，发布历史必须保留，不能永久删除",
  not_owner: "只能永久删除自己创建的词条",
  unknown_identity: "无法确认当前管理员身份，请刷新后重试",
  missing_revision: "该行缺少并发版本信息，请刷新列表后重试"
};

/**
 * 判定顺序与后端 delete_entry_in_transaction 对齐：归属先于可删性。
 * 这样管理员看到的拒绝理由，和绕过 UI 直接调接口时拿到的错误是同一个。
 */
export function evaluateDeleteEligibility(
  actor: DeleteActor | undefined,
  row: AdminWordListItemAny
): DeleteEligibility {
  if (!actor) return { deletable: false, reason: "unknown_identity" };
  if (row.status !== "archived") {
    return { deletable: false, reason: "not_archived" };
  }
  if (
    typeof row.revision !== "number" ||
    typeof row.lifecycle_revision !== "number"
  ) {
    return { deletable: false, reason: "missing_revision" };
  }
  if (actor.role !== "super_admin" && row.created_by !== actor.id) {
    return { deletable: false, reason: "not_owner" };
  }
  // 发布过的词条即使在垃圾桶里也删不掉；published_revision 缺省即从未发布。
  // 该字段对 legacy 行也会缺省，可能漏判——后端的 409 是最终兜底。
  if (row.published_revision !== undefined) {
    return { deletable: false, reason: "published" };
  }
  return { deletable: true };
}

/** 批量入口：返回整批是否可提交，以及被挡下的条目（供提交前拦截时列出）。 */
export function partitionDeletableRows(
  actor: DeleteActor | undefined,
  rows: AdminWordListItemAny[]
): {
  deletable: AdminWordListItemAny[];
  blocked: { row: AdminWordListItemAny; reason: DeleteBlockReason }[];
} {
  const deletable: AdminWordListItemAny[] = [];
  const blocked: { row: AdminWordListItemAny; reason: DeleteBlockReason }[] =
    [];
  for (const row of rows) {
    const eligibility = evaluateDeleteEligibility(actor, row);
    if (eligibility.deletable) {
      deletable.push(row);
    } else {
      blocked.push({ row, reason: eligibility.reason! });
    }
  }
  return { deletable, blocked };
}
