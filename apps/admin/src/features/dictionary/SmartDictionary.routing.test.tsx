import type { AdminWordListItem } from "@tsz/types";
import { describe, expect, it } from "vitest";

import { getWordRowActionLabel, getWordRowRoute } from "./wordRouting";

function row(overrides: Partial<AdminWordListItem> = {}): AdminWordListItem {
  return {
    schema_version: 2,
    id: "w-1",
    headword: "centre",
    kind: "word",
    gloss: "中心",
    pos_list: ["noun"],
    levels: ["A1"],
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    max_reachable_step: "basics",
    has_unpublished_changes: false,
    created_by_name: "Admin",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides
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
});
