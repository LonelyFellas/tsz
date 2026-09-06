import type { MatchedEntryContextV3 } from "./surface-match";

/**
 * 词条标注：同原型组（相同 dialect_scope + normalized_surface）内区分同形词条的短标签。
 * 契约见 tsz-rust docs/features/entry-annotations/design.md 与 frontend-integration.md §22。
 */

/** `409 annotation_conflict` 的原因。 */
export type EntryAnnotationConflictReason =
  "required" | "duplicate" | "revision_conflict" | "group_changed";

export interface EntryAnnotationGroup {
  dialect_scope: string;
  normalized_surface: string;
  /** 已有词条；创建中的新词条隐式属于每一组，不伪造 UUID。 */
  entry_ids: string[];
}

/** `ProblemMeta.annotation_conflict`：新条直接相关的完整 entries 与 groups。 */
export interface EntryAnnotationConflict {
  reason: EntryAnnotationConflictReason;
  entries: MatchedEntryContextV3[];
  groups: EntryAnnotationGroup[];
}

/** 创建请求 `annotation_updates` 的元素：同原型已有词条的标注（含未改动的）。 */
export interface EntryAnnotationUpdate {
  entry_id: string;
  /** ≤ 20 个 Unicode scalar；null 表示清空。 */
  annotation?: string | null;
  base_annotation_revision: number;
}

/** `PATCH /admin/lexicon/entries/{id}/annotation` 请求体。 */
export interface UpdateEntryAnnotationInput {
  annotation?: string | null;
  base_annotation_revision: number;
}

/** `PATCH /admin/lexicon/entries/{id}/annotation` 200 响应。 */
export interface EntryAnnotationResponse {
  entry_id: string;
  annotation: string | null;
  annotation_revision: number;
}
