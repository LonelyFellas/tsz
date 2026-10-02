import { describe, expect, it } from "vitest";
import {
  canCreateEntry,
  canCheckEntry,
  canWriteEntry,
  canPublishEntry,
  canTransitionEntry,
  entryWriteForbiddenMessage,
  isEntryOwnershipError
} from "./entryWritePermission";

const own = { created_by: "admin-1", published_revision: 2 };
const other = { created_by: "admin-2", published_revision: 2 };
const actor = (permissions: string[]) => ({
  id: "admin-1",
  role: "admin",
  permissions: ["words.access", ...permissions]
});
const superAdmin = { id: "super", role: "super_admin", permissions: [] };

describe("统一词条权限与归属", () => {
  it("零业务权限、旧发布布尔值都不能授权，创建与编辑独立", () => {
    const legacy = { id: "admin-1", role: "admin", can_publish_lexicon: true };
    expect(canCreateEntry(legacy)).toBe(false);
    expect(canWriteEntry(legacy, own)).toBe(false);
    expect(canPublishEntry(legacy, own)).toBe(false);
    expect(canCreateEntry(actor(["words.create"]))).toBe(true);
    expect(canWriteEntry(actor(["words.create"]), own)).toBe(false);
    expect(canCreateEntry(actor(["words.edit"]))).toBe(false);
    expect(canWriteEntry(null, own)).toBe(false);
  });
  it("校验匹配edit/publish/validate任一能力，不借create或access自动放行", () => {
    for (const key of ["words.edit", "words.publish", "words.validate"])
      expect(canCheckEntry(actor([key]))).toBe(true);
    expect(canCheckEntry(actor(["words.create"]))).toBe(false);
    expect(canCheckEntry(actor([]))).toBe(false);
    expect(canCheckEntry(superAdmin)).toBe(true);
  });
  it("edit 仅本人，edit_others 依赖 edit；已发布内容可编修订，归属不转移", () => {
    expect(canWriteEntry(actor(["words.edit"]), own)).toBe(true);
    expect(canWriteEntry(actor(["words.edit"]), other)).toBe(false);
    expect(canWriteEntry(actor(["words.edit_others"]), other)).toBe(false);
    expect(
      canWriteEntry(actor(["words.edit", "words.edit_others"]), other)
    ).toBe(true);
    expect(canWriteEntry(actor(["words.edit"]), {})).toBe(false);
    expect(canWriteEntry(superAdmin, other)).toBe(true);
  });
  it("发布、归档和恢复各自授权且普通管理员限本人，不借 edit_others 扩大范围", () => {
    const editor = actor(["words.edit", "words.edit_others"]);
    expect(canPublishEntry(editor, own)).toBe(false);
    expect(canTransitionEntry(editor, own)).toBe(false);
    const publisher = actor(["words.publish"]);
    expect(canPublishEntry(publisher, own)).toBe(true);
    expect(canPublishEntry(publisher, other)).toBe(false);
    expect(canTransitionEntry(publisher, own)).toBe(false);
    const lifecycle = actor([
      "words.archive",
      "words.restore",
      "words.edit",
      "words.edit_others"
    ]);
    expect(canTransitionEntry(lifecycle, own, "archive")).toBe(true);
    expect(canTransitionEntry(lifecycle, own, "restore")).toBe(true);
    expect(canTransitionEntry(lifecycle, other, "archive")).toBe(false);
    expect(canTransitionEntry(lifecycle, other, "restore")).toBe(false);
    expect(canTransitionEntry(actor(["words.archive"]), own, "restore")).toBe(
      false
    );
    expect(canTransitionEntry(superAdmin, other, "restore")).toBe(true);
  });
  it("403 不猜测普通 forbidden 是归属还是业务能力不足", () => {
    expect(isEntryOwnershipError("entry_edit_forbidden")).toBe(true);
    expect(isEntryOwnershipError("forbidden")).toBe(false);
    expect(entryWriteForbiddenMessage("entry_edit_forbidden")).toContain(
      "归属"
    );
    expect(entryWriteForbiddenMessage("forbidden")).toContain("没有执行该操作");
  });
});
