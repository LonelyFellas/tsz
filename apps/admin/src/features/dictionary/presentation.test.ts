import type { AdminWordListItemAny, AdminWordListItemV3 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  observeWordListPresentation,
  visibleWordAnnotation,
  wordListDialects,
  wordListLabel
} from "./presentation";

const v3Row = (
  presentation: AdminWordListItemV3["presentation"]
): AdminWordListItemV3 => ({
  annotation_visible: false,
  schema_version: 3,
  id: "v3-entry",
  kind: "word",
  presentation,
  dialects: ["uk", "us"],
  revision: 4,
  lifecycle_revision: 2,
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
  updated_at: "2026-08-25T00:00:00Z"
});

describe("mixed word list presentation", () => {
  it("V3 忠实消费服务端 presentation 与 dialects，不从具体词形猜展示名或方言", () => {
    const row = v3Row({
      label: "legacy: centre · center",
      matched_surfaces: ["centre", "center"],
      strategy_version: "legacy_headwords_v1"
    });

    expect(wordListLabel(row)).toBe("legacy: centre · center");
    expect(wordListDialects(row)).toEqual(["uk", "us"]);
  });

  it("V3 空白草稿的 dialects 为空数组时保持未知，不落回默认", () => {
    const row = {
      ...v3Row({
        label: "未命名词条",
        matched_surfaces: [],
        strategy_version: "short_uuid_v1"
      }),
      dialects: []
    };

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
});

describe("visibleWordAnnotation", () => {
  function row(
    annotation: string | null,
    annotation_visible: boolean
  ): AdminWordListItemAny {
    return {
      ...v3Row({
        label: "center",
        matched_surfaces: ["center"],
        strategy_version: "surface_summary_v1"
      }),
      dialects: ["common"],
      pos_list: [],
      levels: [],
      annotation,
      annotation_visible
    };
  }

  it("有标注且服务端判定可见时返回标注", () => {
    expect(visibleWordAnnotation(row("007", true))).toBe("007");
  });

  it("服务端判定不可见时不返回（值仍在库里，只是不展示）", () => {
    expect(visibleWordAnnotation(row("007", false))).toBeUndefined();
  });

  it("未标注时不返回，可见标志为真也一样", () => {
    expect(visibleWordAnnotation(row(null, true))).toBeUndefined();
    expect(visibleWordAnnotation(row("", true))).toBeUndefined();
    expect(visibleWordAnnotation(row("   ", true))).toBeUndefined();
  });

  it("标注不影响展示名", () => {
    expect(wordListLabel(row("007", true))).toBe("center");
  });
});
