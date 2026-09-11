import type { AdminWordListItemAny } from "@tsz/types";
import { describe, expect, it } from "vitest";

import { getWordRowActionLabel, getWordRowRoute } from "./wordRouting";

type V3Row = Extract<AdminWordListItemAny, { schema_version: 3 }>;

function row(overrides: Partial<V3Row> = {}): V3Row {
  return {
    annotation_visible: false,
    schema_version: 3,
    id: "v3-1",
    kind: "word",
    presentation: {
      label: "centre · center",
      matched_surfaces: ["centre", "center"],
      strategy_version: "surface_summary_v1"
    },
    dialects: ["uk", "us"],
    revision: 3,
    lifecycle_revision: 1,
    annotation: null,
    annotation_revision: 1,
    gloss: "中心",
    pos_list: ["noun"],
    levels: ["A1"],
    status: "draft",
    has_unpublished_changes: false,
    max_reachable_step: "forms",
    created_by_name: "Admin",
    created_by: "admin-1",
    reference_summary: { total: 0, previews: [], truncated: false },
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
    ...overrides
  };
}

describe("智能词库行入口", () => {
  it("草稿按最大可达步骤继续创建", () => {
    const record = row({ max_reachable_step: "meanings" });
    expect(getWordRowActionLabel(record)).toBe("继续创建");
    expect(getWordRowRoute(record)).toBe("/words/v3-1/v3/wizard/meanings");
  });

  it("可达步骤不在四步之内时安全回到 basics", () => {
    const record = {
      ...row(),
      max_reachable_step: "unknown"
    } as unknown as AdminWordListItemAny;
    expect(getWordRowRoute(record)).toBe("/words/v3-1/v3/wizard/basics");
  });

  it("已发布词条只读查看 preview", () => {
    const record = row({ status: "published", max_reachable_step: "preview" });
    expect(getWordRowActionLabel(record)).toBe("查看");
    expect(getWordRowRoute(record)).toBe("/words/v3-1/v3/wizard/preview");
  });

  it("已发布但有未发布修改时恢复到可达步骤继续编辑", () => {
    const record = row({
      status: "published",
      max_reachable_step: "meanings",
      has_unpublished_changes: true
    });
    expect(getWordRowActionLabel(record)).toBe("继续编辑");
    expect(getWordRowRoute(record)).toBe(
      "/words/v3-1/v3/wizard/meanings?mode=edit"
    );
  });

  it("短语与单词走同一套 V3 路径", () => {
    const record = row({ kind: "phrase", max_reachable_step: "forms" });
    expect(getWordRowActionLabel(record)).toBe("继续创建");
    expect(getWordRowRoute(record)).toBe("/words/v3-1/v3/wizard/forms");
  });

  it("旧结构与未知 schema 都交不出路由，但不抛异常炸掉整张表", () => {
    for (const schemaVersion of [1, 2, 9]) {
      const legacy = {
        ...row(),
        schema_version: schemaVersion
      } as unknown as AdminWordListItemAny;

      expect(getWordRowRoute(legacy)).toBeUndefined();
    }
  });
});
