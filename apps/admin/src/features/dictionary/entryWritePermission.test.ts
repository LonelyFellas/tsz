import { describe, expect, it } from "vitest";
import type { AdminWordListItemAny } from "@tsz/types";
import {
  canWriteEntry,
  entryWriteForbiddenMessage,
  isEntryOwnershipError,
  partitionWritableRows
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
  it("本人的未发布草稿可写", () => {
    expect(canWriteEntry(owner, row())).toBe(true);
  });

  it("他人的未发布草稿不可写", () => {
    expect(canWriteEntry(stranger, row())).toBe(false);
  });

  it("超管不受创建人限制", () => {
    expect(canWriteEntry(superAdmin, row())).toBe(true);
  });

  it("已发布词条全员可写——收口只针对未发布草稿", () => {
    const published = row({
      status: "published",
      published_revision: 3
    });
    expect(canWriteEntry(stranger, published)).toBe(true);
  });

  it("已发布且带未发布修改的词条同样全员可写", () => {
    const editing = row({
      status: "published",
      published_revision: 2,
      has_unpublished_changes: true
    });
    expect(canWriteEntry(stranger, editing)).toBe(true);
  });

  it("归档了的草稿仍按未发布处理：垃圾桶里别人的草稿恢复不了", () => {
    // 归档优先于发布态，所以这一行的 status 是 archived 而不是 draft——
    // 判定必须走 published_revision，否则这条会被漏放行。
    const archivedDraft = row({ status: "archived" });
    expect(canWriteEntry(stranger, archivedDraft)).toBe(false);
    expect(canWriteEntry(owner, archivedDraft)).toBe(true);
  });

  it("归档了的已发布词条不受限", () => {
    const archivedPublished = row({
      status: "archived",
      published_revision: 2
    });
    expect(canWriteEntry(stranger, archivedPublished)).toBe(true);
  });

  it("拿不到管理员身份时一律不放行", () => {
    expect(canWriteEntry(undefined, row())).toBe(false);
  });

  it("行上缺少 created_by 时不放行——判不了归属就不猜", () => {
    expect(canWriteEntry(owner, row({ created_by: undefined }))).toBe(false);
  });
});

describe("partitionWritableRows", () => {
  it("把他人的未发布草稿挑出来，其余照常可提交", () => {
    const mine = row({ id: "mine" });
    const theirs = row({ id: "theirs", created_by: "admin-2" });
    const published = row({
      id: "published",
      created_by: "admin-2",
      status: "published",
      published_revision: 1
    });
    const { writable, blocked } = partitionWritableRows(owner, [
      mine,
      theirs,
      published
    ]);
    expect(writable.map((r) => r.id)).toEqual(["mine", "published"]);
    expect(blocked.map((r) => r.id)).toEqual(["theirs"]);
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
