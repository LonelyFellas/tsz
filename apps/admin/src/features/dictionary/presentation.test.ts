import type { AdminWordListItemAny, AdminWordListItemV3 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  observeWordListPresentation,
  wordListDialects,
  wordListLabel
} from "./presentation";

const v3Row = (
  presentation: AdminWordListItemV3["presentation"]
): AdminWordListItemV3 => ({
  schema_version: 3,
  id: "v3-entry",
  kind: "word",
  presentation,
  revision: 4,
  lifecycle_revision: 2,
  gloss: "中心",
  pos_list: ["noun"],
  levels: ["A1"],
  status: "draft",
  has_unpublished_changes: false,
  max_reachable_step: "forms",
  created_by_name: "Admin",
  created_by: "admin-1",
  created_at: "2026-08-25T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z"
});

describe("mixed word list presentation", () => {
  it("V2 保留既有 headword 与 dialects", () => {
    const row: AdminWordListItemAny = {
      schema_version: 2,
      id: "v2-entry",
      headword: "centre / center",
      kind: "word",
      dialects: ["uk", "us"],
      headword_variants: [
        { dialect: "uk", headword: "centre" },
        { dialect: "us", headword: "center" }
      ],
      source_dialect: "uk",
      gloss: "中心",
      pos_list: ["noun"],
      levels: ["A1"],
      status: "draft",
      revision: 1,
      lifecycle_revision: 1,
      max_reachable_step: "forms",
      has_unpublished_changes: false,
      created_by_name: "Admin",
      created_by: "admin-1",
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-25T00:00:00Z"
    };

    expect(wordListLabel(row)).toBe("centre / center");
    expect(wordListDialects(row)).toEqual(["uk", "us"]);
  });

  it("V3 忠实消费服务端 presentation，不从具体词形猜展示名或方言", () => {
    const row = v3Row({
      label: "legacy: centre · center",
      matched_surfaces: ["centre", "center"],
      strategy_version: "legacy_headwords_v1"
    });

    expect(wordListLabel(row)).toBe("legacy: centre · center");
    expect(wordListDialects(row)).toEqual([]);
  });

  it("未知但非空的 presentation strategy 仍按响应展示并上报安全诊断", () => {
    const row = v3Row({
      label: "服务端未来展示策略",
      matched_surfaces: [],
      strategy_version: "future_strategy_9"
    });
    const report = vi.fn();

    expect(wordListLabel(row)).toBe("服务端未来展示策略");
    expect(observeWordListPresentation(row, report)).toBe(true);
    expect(report).toHaveBeenCalledWith({
      entry_id: "v3-entry",
      strategy_version: "future_strategy_9"
    });
  });

  it.each(["legacy_headwords_v1", "surface_summary_v1", "short_uuid_v1", ""])(
    "已知或空 strategy %s 不误报",
    (strategyVersion) => {
      const report = vi.fn();
      const row = v3Row({
        label: "正常展示",
        matched_surfaces: [],
        strategy_version: strategyVersion
      });

      expect(observeWordListPresentation(row, report)).toBe(false);
      expect(report).not.toHaveBeenCalled();
    }
  );

  it("V2 不进入 V3 presentation 观测", () => {
    const report = vi.fn();
    const row = {
      schema_version: 2,
      id: "v2-entry",
      headword: "word",
      kind: "word",
      dialects: ["common"],
      headword_variants: [{ dialect: "common", headword: "word" }],
      gloss: "词",
      pos_list: [],
      levels: [],
      status: "draft",
      revision: 1,
      lifecycle_revision: 1,
      max_reachable_step: "basics",
      has_unpublished_changes: false,
      created_by_name: "Admin",
      created_by: "admin-1",
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-25T00:00:00Z"
    } as const satisfies AdminWordListItemAny;

    expect(observeWordListPresentation(row, report)).toBe(false);
    expect(report).not.toHaveBeenCalled();
  });
});
