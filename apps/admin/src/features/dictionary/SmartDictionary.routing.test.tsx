import type { AdminWordListItemAny } from "@tsz/types";
import { describe, expect, it } from "vitest";

import { getWordRowActionLabel, getWordRowRoute } from "./wordRouting";

function row(
  overrides: Partial<Extract<AdminWordListItemAny, { schema_version: 2 }>> = {}
): Extract<AdminWordListItemAny, { schema_version: 2 }> {
  const base: Extract<AdminWordListItemAny, { schema_version: 2 }> = {
    schema_version: 2,
    id: "w-1",
    headword: "centre",
    kind: "word",
    dialects: ["common"],
    headword_variants: [{ dialect: "common", headword: "centre" }],
    gloss: "中心",
    pos_list: ["noun"],
    levels: ["A1"],
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    max_reachable_step: "basics",
    has_unpublished_changes: false,
    created_by_name: "Admin",
    created_by: "admin-1",
    reference_summary: { total: 0, previews: [], truncated: false },
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  };
  return {
    ...base,
    ...overrides,
    headword_variants: overrides.headword_variants ?? base.headword_variants
  };
}

describe("智能词库行入口", () => {
  it("V2 草稿按最大可达步骤继续创建", () => {
    const record = row({
      schema_version: 2,
      max_reachable_step: "meanings"
    });
    expect(getWordRowActionLabel(record)).toBe("继续创建");
    expect(getWordRowRoute(record)).toBe("/words/w-1/wizard/meanings");
  });

  it("V2 草稿缺少可达步骤时安全回到 basics", () => {
    const record = row({ schema_version: 2 });
    expect(getWordRowRoute(record)).toBe("/words/w-1/wizard/basics");
  });

  it("V2 已发布词条只读查看 preview", () => {
    const record = row({ schema_version: 2, status: "published" });
    expect(getWordRowActionLabel(record)).toBe("查看");
    expect(getWordRowRoute(record)).toBe("/words/w-1/wizard/preview");
  });

  it("V2 已发布但有未发布修改时恢复到可达步骤继续编辑", () => {
    const record = row({
      schema_version: 2,
      status: "published",
      max_reachable_step: "meanings",
      published_revision: 4,
      has_unpublished_changes: true
    });
    expect(getWordRowActionLabel(record)).toBe("继续编辑");
    expect(getWordRowRoute(record)).toBe(
      "/words/w-1/wizard/meanings?mode=edit"
    );
  });

  it("V2 phrase 保持原向导路径", () => {
    const record = row({ kind: "phrase", max_reachable_step: "forms" });
    expect(getWordRowActionLabel(record)).toBe("继续创建");
    expect(getWordRowRoute(record)).toBe("/words/w-1/wizard/forms");
  });

  it("V3 草稿进入独立 V3 向导路径", () => {
    const record: Extract<AdminWordListItemAny, { schema_version: 3 }> = {
      schema_version: 3,
      id: "v3-1",
      kind: "word",
      presentation: {
        label: "centre · center",
        matched_surfaces: ["centre", "center"],
        strategy_version: "surface_summary_v1"
      },
      revision: 3,
      lifecycle_revision: 1,
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
      updated_at: "2026-08-25T00:00:00Z"
    };

    expect(getWordRowActionLabel(record)).toBe("继续创建");
    expect(getWordRowRoute(record)).toBe("/words/v3-1/v3/wizard/forms");
  });

  it("V3 已发布状态沿用 preview 与 edit 规则，但保持 V3 路径", () => {
    const base: Extract<AdminWordListItemAny, { schema_version: 3 }> = {
      schema_version: 3,
      id: "v3-2",
      kind: "word",
      presentation: {
        label: "entry v3",
        matched_surfaces: [],
        strategy_version: "surface_summary_v1"
      },
      revision: 8,
      lifecycle_revision: 3,
      gloss: "",
      pos_list: [],
      levels: [],
      status: "published",
      has_unpublished_changes: false,
      max_reachable_step: "preview",
      created_by_name: "Admin",
      created_by: "admin-1",
      reference_summary: { total: 0, previews: [], truncated: false },
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-25T00:00:00Z"
    };

    expect(getWordRowRoute(base)).toBe("/words/v3-2/v3/wizard/preview");
    expect(
      getWordRowRoute({
        ...base,
        has_unpublished_changes: true,
        max_reachable_step: "meanings"
      })
    ).toBe("/words/v3-2/v3/wizard/meanings?mode=edit");
  });

  it("未知 schema 不降级进入 V2 路由", () => {
    const unknown = {
      ...row(),
      schema_version: 9
    } as unknown as AdminWordListItemAny;

    expect(() => getWordRowRoute(unknown)).toThrow(
      "unsupported schema_version: 9"
    );
  });
});
