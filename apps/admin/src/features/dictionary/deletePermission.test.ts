import { describe, expect, it } from "vitest";
import type { AdminWordListItemAny } from "@tsz/types";
import {
  DELETE_BLOCK_REASON_TEXT,
  evaluateDeleteEligibility,
  partitionDeletableRows
} from "./deletePermission";

function row(overrides: Partial<AdminWordListItemAny> = {}) {
  return {
    annotation: null,
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
    status: "archived",
    has_unpublished_changes: false,
    max_reachable_step: "basics",
    created_by_name: "Admin",
    created_by: "admin-1",
    reference_summary: { total: 0, previews: [], truncated: false },
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    ...overrides
  } as AdminWordListItemAny;
}

const owner = { id: "admin-1", role: "admin" };
const superAdmin = { id: "admin-9", role: "super_admin" };

describe("evaluateDeleteEligibility", () => {
  it("普通管理员不能删除自己的或他人的词条", () => {
    for (const created_by of [owner.id, "admin-2", undefined]) {
      expect(evaluateDeleteEligibility(owner, row({ created_by }))).toEqual({
        deletable: false,
        reason: "read_only"
      });
    }
    expect(evaluateDeleteEligibility(undefined, row())).toEqual({
      deletable: false,
      reason: "unknown_identity"
    });
  });

  it("超管仍受归档、版本、发布历史和引用保护约束", () => {
    expect(evaluateDeleteEligibility(superAdmin, row())).toEqual({
      deletable: true
    });
    for (const status of ["draft", "published"] as const) {
      expect(evaluateDeleteEligibility(superAdmin, row({ status }))).toEqual({
        deletable: false,
        reason: "not_archived"
      });
    }
    for (const missing of [
      { revision: undefined },
      { lifecycle_revision: undefined }
    ]) {
      expect(evaluateDeleteEligibility(superAdmin, row(missing))).toEqual({
        deletable: false,
        reason: "missing_revision"
      });
    }
    expect(
      evaluateDeleteEligibility(superAdmin, row({ published_revision: 2 }))
    ).toEqual({
      deletable: false,
      reason: "published"
    });
    expect(
      evaluateDeleteEligibility(
        superAdmin,
        row({
          reference_summary: { total: 2, previews: [], truncated: false }
        })
      )
    ).toEqual({ deletable: false, reason: "referenced" });
  });

  it("每个拦截原因都有对应文案", () => {
    for (const text of Object.values(DELETE_BLOCK_REASON_TEXT))
      expect(text).toBeTruthy();
  });
});

describe("partitionDeletableRows", () => {
  it("普通管理员全部拦截，超管按业务约束分组", () => {
    const rows = [
      row({ id: "mine" }),
      row({ id: "others", created_by: "admin-2" }),
      row({ id: "published", published_revision: 1 }),
      row({ id: "active", status: "draft" })
    ];
    expect(partitionDeletableRows(owner, rows)).toEqual({
      deletable: [],
      blocked: rows.map((item) => ({ row: item, reason: "read_only" }))
    });
    const result = partitionDeletableRows(superAdmin, rows);
    expect(result.deletable.map((item) => item.id)).toEqual(["mine", "others"]);
    expect(
      result.blocked.map(({ row: item, reason }) => [item.id, reason])
    ).toEqual([
      ["published", "published"],
      ["active", "not_archived"]
    ]);
  });

  it("空选择返回空分组", () => {
    expect(partitionDeletableRows(owner, [])).toEqual({
      deletable: [],
      blocked: []
    });
  });
});
