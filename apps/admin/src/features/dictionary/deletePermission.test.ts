import { describe, expect, it } from "vitest";
import type { AdminWordListItemAny } from "@tsz/types";
import {
  DELETE_BLOCK_REASON_TEXT,
  evaluateDeleteEligibility,
  partitionDeletableRows
} from "./deletePermission";

function row(overrides: Partial<AdminWordListItemAny> = {}) {
  return {
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
const stranger = { id: "admin-2", role: "admin" };
const superAdmin = { id: "admin-9", role: "super_admin" };

describe("evaluateDeleteEligibility", () => {
  it("垃圾桶里本人创建、从未发布的词条可删", () => {
    expect(evaluateDeleteEligibility(owner, row())).toEqual({
      deletable: true
    });
  });

  it("超管不受创建人限制", () => {
    expect(evaluateDeleteEligibility(superAdmin, row())).toEqual({
      deletable: true
    });
  });

  it("普通管理员删他人创建的词条被拦下", () => {
    expect(evaluateDeleteEligibility(stranger, row())).toEqual({
      deletable: false,
      reason: "not_owner"
    });
  });

  it("垃圾桶之外不提供永久删除", () => {
    for (const status of ["draft", "published"] as const) {
      expect(evaluateDeleteEligibility(owner, row({ status }))).toEqual({
        deletable: false,
        reason: "not_archived"
      });
    }
  });

  it("发布过的归档词条不可删", () => {
    expect(
      evaluateDeleteEligibility(owner, row({ published_revision: 2 }))
    ).toEqual({ deletable: false, reason: "published" });
  });

  it("拿不到当前管理员身份时保守不放行", () => {
    expect(evaluateDeleteEligibility(undefined, row())).toEqual({
      deletable: false,
      reason: "unknown_identity"
    });
  });

  it("缺少乐观锁字段时不放行", () => {
    for (const missing of [
      { revision: undefined },
      { lifecycle_revision: undefined }
    ]) {
      expect(
        evaluateDeleteEligibility(
          owner,
          row(missing as Partial<AdminWordListItemAny>)
        )
      ).toEqual({ deletable: false, reason: "missing_revision" });
    }
  });

  it("归属判定先于可删性——与后端错误优先级一致", () => {
    // 他人创建 + 已发布：后端先答 403，前端不能先说「已发布」而暴露该词条状态。
    expect(
      evaluateDeleteEligibility(stranger, row({ published_revision: 2 }))
    ).toEqual({ deletable: false, reason: "not_owner" });
  });

  it("被其他内容引用时不可删——与后端入站引用拦截同口径", () => {
    expect(
      evaluateDeleteEligibility(
        owner,
        row({
          reference_summary: {
            total: 2,
            previews: [],
            truncated: false
          }
        })
      )
    ).toEqual({ deletable: false, reason: "referenced" });
  });

  it("引用数为 0 时可删——这条不变量由后端测试同时守着", () => {
    expect(
      evaluateDeleteEligibility(
        owner,
        row({
          reference_summary: { total: 0, previews: [], truncated: false }
        })
      )
    ).toEqual({ deletable: true });
  });

  it("每个拦截原因都有对应文案", () => {
    const reasons = [
      "not_archived",
      "published",
      "referenced",
      "not_owner",
      "unknown_identity",
      "missing_revision"
    ] as const;
    for (const reason of reasons) {
      expect(DELETE_BLOCK_REASON_TEXT[reason]).toBeTruthy();
    }
  });
});

describe("partitionDeletableRows", () => {
  it("按可删与否分组，并带上每条被挡下的原因", () => {
    const mine = row({ id: "mine" });
    const others = row({ id: "others", created_by: "admin-2" });
    const published = row({ id: "published", published_revision: 1 });
    const active = row({ id: "active", status: "draft" });

    const result = partitionDeletableRows(owner, [
      mine,
      others,
      published,
      active
    ]);

    expect(result.deletable.map((item) => item.id)).toEqual(["mine"]);
    expect(
      result.blocked.map(({ row: blockedRow, reason }) => [
        blockedRow.id,
        reason
      ])
    ).toEqual([
      ["others", "not_owner"],
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
