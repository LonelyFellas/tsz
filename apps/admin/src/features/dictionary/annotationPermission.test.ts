import { describe, expect, it } from "vitest";
import type { AdminWordListItemAny } from "@tsz/types";
import {
  annotationForbiddenMessage,
  canEditAnnotationOf,
  canEditConflictEntry,
  canEditRowAnnotation,
  isAnnotationOwnershipError
} from "./annotationPermission";

function row(overrides: Partial<AdminWordListItemAny> = {}) {
  return {
    annotation: "001",
    annotation_visible: true,
    annotation_revision: 1,
    schema_version: 2,
    id: "w-1",
    headword: "colour",
    kind: "word",
    dialects: ["common"],
    headword_variants: [{ dialect: "common", headword: "colour" }],
    revision: 3,
    lifecycle_revision: 2,
    gloss: "颜色",
    pos_list: [],
    levels: [],
    status: "draft",
    has_unpublished_changes: false,
    max_reachable_step: "basics",
    created_by_name: "Admin",
    created_by: "admin-1",
    reference_summary: { total: 0, previews: [], truncated: false },
    created_at: "2026-09-07T00:00:00Z",
    updated_at: "2026-09-07T00:00:00Z",
    ...overrides
  } as AdminWordListItemAny;
}

const owner = { id: "admin-1", role: "admin" };
const stranger = { id: "admin-2", role: "admin" };
const superAdmin = { id: "admin-9", role: "super_admin" };

describe("标注写权限", () => {
  it("普通管理员和身份缺失时不允许修改标注", () => {
    for (const actor of [owner, stranger, undefined]) {
      expect(canEditAnnotationOf(actor)).toBe(false);
      expect(canEditConflictEntry(actor)).toBe(false);
      expect(canEditRowAnnotation(actor, row())).toBe(false);
      expect(canEditRowAnnotation(actor, row({ created_by: undefined }))).toBe(
        false
      );
      expect(canEditRowAnnotation(actor, row({ annotation: null }))).toBe(
        false
      );
    }
  });

  it("超管可修改标注，入口仍受重复原型标记约束", () => {
    expect(canEditAnnotationOf(superAdmin)).toBe(true);
    expect(canEditConflictEntry(superAdmin)).toBe(true);
    expect(canEditRowAnnotation(superAdmin, row())).toBe(true);
    expect(canEditRowAnnotation(superAdmin, row({ annotation: null }))).toBe(
      true
    );
    expect(
      canEditRowAnnotation(superAdmin, row({ created_by: undefined }))
    ).toBe(true);
    expect(
      canEditRowAnnotation(superAdmin, row({ annotation_visible: false }))
    ).toBe(false);
  });
});

describe("403 文案", () => {
  it("归属越权给出确切原因", () => {
    expect(isAnnotationOwnershipError("entry_annotation_forbidden")).toBe(true);
    expect(annotationForbiddenMessage("entry_annotation_forbidden")).toBe(
      "只能修改自己创建的词条的标注。"
    );
  });

  it("其它 403 退回宽口径说法，不冒充归属原因", () => {
    expect(isAnnotationOwnershipError("forbidden")).toBe(false);
    expect(isAnnotationOwnershipError(undefined)).toBe(false);
    expect(annotationForbiddenMessage(undefined)).toBe(
      "当前账号没有修改该词条标注的权限。"
    );
  });
});
