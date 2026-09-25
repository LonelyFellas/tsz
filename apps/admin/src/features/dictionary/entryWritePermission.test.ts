import { describe, expect, it } from "vitest";
import type { AdminWordListItemAny } from "@tsz/types";
import {
  canWriteEntry,
  canPublishEntry,
  canTransitionEntry,
  entryWriteForbiddenMessage,
  isEntryOwnershipError
} from "./entryWritePermission";

function row(overrides: Partial<AdminWordListItemAny> = {}) {
  return {
    annotation: null,
    annotation_revision: 1,
    schema_version: 3,
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
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
    ...overrides
  } as AdminWordListItemAny;
}

const owner = { id: "admin-1", role: "admin" };
const stranger = { id: "admin-2", role: "admin" };
const superAdmin = { id: "admin-9", role: "super_admin" };

describe("canWriteEntry", () => {
  it("普通管理员和无身份用户默认不可写，超管可写", () => {
    expect(canWriteEntry(owner)).toBe(false);
    expect(canWriteEntry(stranger)).toBe(false);
    expect(canWriteEntry(undefined)).toBe(false);
    expect(canWriteEntry(null)).toBe(false);
    expect(canWriteEntry(superAdmin)).toBe(true);
    expect(canWriteEntry({ ...owner, can_publish_lexicon: true })).toBe(false);
  });
});

describe("错误分流", () => {
  it("认得后端的归属越权 code", () => {
    expect(isEntryOwnershipError("entry_edit_forbidden")).toBe(true);
    expect(isEntryOwnershipError("entry_delete_forbidden")).toBe(false);
    expect(isEntryOwnershipError(undefined)).toBe(false);
  });

  it("归属越权与「没有权限」给不同的话", () => {
    expect(entryWriteForbiddenMessage("entry_edit_forbidden")).toContain(
      "自己创建"
    );
    expect(entryWriteForbiddenMessage(undefined)).toContain("没有执行该操作");
  });
});

describe("独立发布权限", () => {
  it("编辑能力不授予发布权，普通发布者不能发布他人的草稿", () => {
    expect(canWriteEntry(owner)).toBe(false);
    expect(canPublishEntry(owner, row())).toBe(false);
    expect(
      canPublishEntry({ ...owner, can_publish_lexicon: true }, row())
    ).toBe(true);
    expect(
      canPublishEntry({ ...stranger, can_publish_lexicon: true }, row())
    ).toBe(false);
    expect(
      canPublishEntry(
        { ...stranger, can_publish_lexicon: true },
        row({ published_revision: 2 })
      )
    ).toBe(false);
    expect(canPublishEntry(superAdmin, row())).toBe(true);
  });
  it("已发布词条归档恢复需要发布权，草稿归属限制仍生效", () => {
    expect(canTransitionEntry(owner, row())).toBe(false);
    expect(canTransitionEntry(owner, row({ published_revision: 2 }))).toBe(
      false
    );
    expect(
      canTransitionEntry(
        { ...owner, can_publish_lexicon: true },
        row({ published_revision: 2 })
      )
    ).toBe(true);
    expect(
      canTransitionEntry({ ...stranger, can_publish_lexicon: true }, row())
    ).toBe(false);
    expect(canTransitionEntry(superAdmin, row())).toBe(true);
  });
});
