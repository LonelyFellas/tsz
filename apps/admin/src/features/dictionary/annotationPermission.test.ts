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

describe("canEditAnnotationOf", () => {
  it("超管可以改任何词条的标注", () => {
    expect(canEditAnnotationOf(superAdmin, "admin-1")).toBe(true);
  });

  it("其他管理员只能改自己创建的词条", () => {
    expect(canEditAnnotationOf(owner, "admin-1")).toBe(true);
    expect(canEditAnnotationOf(stranger, "admin-1")).toBe(false);
  });

  it("拿不到当前管理员身份时一律不放行", () => {
    expect(canEditAnnotationOf(undefined, "admin-1")).toBe(false);
    expect(canEditAnnotationOf(undefined, undefined)).toBe(false);
  });

  it("创建人缺省时非超管不放行——不拿 undefined === undefined 当自己人", () => {
    expect(canEditAnnotationOf(owner, undefined)).toBe(false);
    expect(canEditAnnotationOf(superAdmin, undefined)).toBe(true);
  });
});

describe("canEditRowAnnotation", () => {
  it("有角标且是自己创建的才给入口", () => {
    expect(canEditRowAnnotation(owner, row())).toBe(true);
  });

  it("别人的词条有角标也不给入口", () => {
    expect(canEditRowAnnotation(stranger, row())).toBe(false);
  });

  it("超管对别人的词条有入口", () => {
    expect(canEditRowAnnotation(superAdmin, row())).toBe(true);
  });

  it("唯一原型没有入口，重复原型允许补充空标注", () => {
    expect(
      canEditRowAnnotation(owner, row({ annotation_visible: false }))
    ).toBe(false);
    expect(canEditRowAnnotation(owner, row({ annotation: null }))).toBe(true);
    expect(canEditRowAnnotation(superAdmin, row({ annotation: null }))).toBe(
      true
    );
    expect(canEditRowAnnotation(stranger, row({ annotation: null }))).toBe(
      false
    );
    expect(canEditRowAnnotation(owner, row({ annotation: "  " }))).toBe(true);
    expect(
      canEditRowAnnotation(superAdmin, row({ annotation_visible: false }))
    ).toBe(false);
  });
});

describe("canEditConflictEntry", () => {
  it("按 created_by 判定归属", () => {
    expect(canEditConflictEntry(owner, { created_by: "admin-1" })).toBe(true);
    expect(canEditConflictEntry(stranger, { created_by: "admin-1" })).toBe(
      false
    );
    expect(canEditConflictEntry(superAdmin, { created_by: "admin-1" })).toBe(
      true
    );
  });

  it("created_by 缺省＝后端未下发归属，按可改处理不锁死建条", () => {
    expect(canEditConflictEntry(stranger, {})).toBe(true);
    expect(canEditConflictEntry(undefined, {})).toBe(true);
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
