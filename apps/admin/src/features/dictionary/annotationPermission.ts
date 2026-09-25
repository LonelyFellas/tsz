import type { AdminWordListItemAny } from "@tsz/types";

export interface AnnotationActor {
  id: string;
  role: string;
}

/** 后端对「非超管改别人的词条」的业务 code。 */
const ANNOTATION_FORBIDDEN_CODES = new Set([
  "entry_annotation_forbidden",
  "entry_annotation_not_owner"
]);

/** 后端明说这个 403 是「改了不属于自己的词条」，而不是「压根没有这块权限」。 */
export function isAnnotationOwnershipError(code: string | undefined): boolean {
  return code !== undefined && ANNOTATION_FORBIDDEN_CODES.has(code);
}

export function canEditAnnotationOf(
  actor: AnnotationActor | undefined
): boolean {
  return actor?.role === "super_admin";
}

/** 重复原型才提供标注入口；空标注也允许由有权限的管理员补填。 */
export function canEditRowAnnotation(
  actor: AnnotationActor | undefined,
  row: AdminWordListItemAny
): boolean {
  if (!row.annotation_visible) return false;
  return canEditAnnotationOf(actor);
}

export function canEditConflictEntry(
  actor: AnnotationActor | undefined
): boolean {
  return canEditAnnotationOf(actor);
}

export const OTHERS_ENTRY_HINT = "当前账号仅有读取权限";

/**
 * 标注保存失败里 403 的文案。归属越权与「压根没有标注权限」对管理员意味不同，
 * 统一说「保存失败」会让人以为是重试就能好的故障。
 * 拿不到具体 code 时退回同时成立的宽口径说法，不猜。
 */
export function annotationForbiddenMessage(code: string | undefined): string {
  return isAnnotationOwnershipError(code)
    ? "只能修改自己创建的词条的标注。"
    : "当前账号没有修改该词条标注的权限。";
}
