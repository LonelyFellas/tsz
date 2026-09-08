import { describe, expect, it } from "vitest";
import type { AdminWordListItemAny } from "@tsz/types";
import { getWordRowActionLabel } from "./wordRouting";

type RouteRecord = Pick<
  AdminWordListItemAny,
  | "id"
  | "schema_version"
  | "status"
  | "max_reachable_step"
  | "has_unpublished_changes"
>;

function record(overrides: Partial<RouteRecord> = {}): RouteRecord {
  return {
    id: "w-1",
    schema_version: 3,
    status: "draft",
    max_reachable_step: "forms",
    has_unpublished_changes: false,
    ...overrides
  } as RouteRecord;
}

describe("getWordRowActionLabel", () => {
  it("自己的草稿给「继续创建」", () => {
    expect(getWordRowActionLabel(record(), true)).toBe("继续创建");
  });

  it("别人的未发布草稿给「查看」——进去也是只读的", () => {
    expect(getWordRowActionLabel(record(), false)).toBe("查看");
  });

  it("归档词条恒为「查看」，与归属无关", () => {
    expect(getWordRowActionLabel(record({ status: "archived" }), true)).toBe(
      "查看"
    );
    expect(getWordRowActionLabel(record({ status: "archived" }), false)).toBe(
      "查看"
    );
  });

  it("已发布词条不受归属影响：有未发布修改就是「继续编辑」", () => {
    const published = record({
      status: "published",
      has_unpublished_changes: true
    });
    expect(getWordRowActionLabel(published, true)).toBe("继续编辑");
    expect(getWordRowActionLabel(published, false)).toBe("继续编辑");
  });

  it("默认可写，保持既有调用点行为不变", () => {
    expect(getWordRowActionLabel(record())).toBe("继续创建");
  });
});
