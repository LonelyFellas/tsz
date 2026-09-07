// 标注的修改权限判定。与 deletePermission 同一套路：**这不是权限**——真正的归属
// 校验在后端（越权返回 403）。前端判定的意义是让管理员在点击前就知道结果，
// 以及在冲突弹窗里把改不了的行摆成只读，而不是填完再被整单驳回。
//
// 规则（2026-09-07 定盘）：超管可以改任何词条的标注；其他管理员只能改自己创建的
// 词条（含自己的草稿）。
import type { AdminWordListItemAny } from "@tsz/types";
import { visibleWordAnnotation } from "./presentation";

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
  actor: AnnotationActor | undefined,
  createdBy: string | undefined
): boolean {
  if (!actor) return false;
  if (actor.role === "super_admin") return true;
  return createdBy !== undefined && createdBy === actor.id;
}

/**
 * 列表行的「标注」入口：**先有角标，再谈归属**。
 *
 * 角标判定见 visibleWordAnnotation——入口的意义是「改这个角标」，两者必须同源。
 * 归属只砍入口不砍角标：别人的词条照常显示角标（管理列表本就没有 actor 过滤），
 * 只是没有编辑按钮。
 */
export function canEditRowAnnotation(
  actor: AnnotationActor | undefined,
  row: AdminWordListItemAny
): boolean {
  if (visibleWordAnnotation(row) === undefined) return false;
  return canEditAnnotationOf(actor, row.created_by);
}

/**
 * 冲突弹窗里的一行能不能改。
 *
 * `created_by` 缺省 = 后端还没下发归属（旧契约要求把整组填满），此时按可改处理：
 * 在后端就绪前把建条流程锁死，比放宽一格更糟。
 */
export function canEditConflictEntry(
  actor: AnnotationActor | undefined,
  entry: { created_by?: string }
): boolean {
  if (entry.created_by === undefined) return true;
  return canEditAnnotationOf(actor, entry.created_by);
}

/** 只读行给出理由，避免留下没有解释的灰输入框。 */
export const OTHERS_ENTRY_HINT = "他人词条";

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
