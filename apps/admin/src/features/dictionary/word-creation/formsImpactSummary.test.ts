import type { FormsImpactItemV2 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { summarizeFormsImpact } from "./formsImpactSummary";

const item = (
  node_id: string,
  node_type: FormsImpactItemV2["node_type"],
  reason: string
): FormsImpactItemV2 => ({ node_id, node_type, reason });

describe("summarizeFormsImpact", () => {
  it("汇总单个受影响节点", () => {
    expect(
      summarizeFormsImpact([item("sense-1", "sense", "词义将被重建")])
    ).toEqual({
      affected_count: 1,
      type_counts: [{ label: "词义", count: 1 }],
      groups: [
        {
          reason: "词义将被重建",
          count: 1,
          type_counts: [{ label: "词义", count: 1 }]
        }
      ],
      warnings: [],
      can_confirm: true
    });
  });

  it("相同原因只生成一组并保留各类型数量", () => {
    const summary = summarizeFormsImpact([
      item("sense-1", "sense", "依赖内容需要复核"),
      item("definition-1", "definition", "依赖内容需要复核"),
      item("sentence-1", "sentence", "例句需要复核")
    ]);
    expect(summary.affected_count).toBe(3);
    expect(summary.groups).toHaveLength(2);
    expect(summary.groups[0]).toEqual({
      reason: "依赖内容需要复核",
      count: 2,
      type_counts: [
        { label: "词义", count: 1 },
        { label: "释义", count: 1 }
      ]
    });
  });

  it("按 node_id 去重完全相同和冲突的重复项并给出警告", () => {
    const summary = summarizeFormsImpact([
      item("same", "sense", "原因一"),
      item("same", "sense", "原因一"),
      item("same", "sentence", "原因二")
    ]);
    expect(summary.affected_count).toBe(1);
    expect(summary.groups).toHaveLength(1);
    expect(summary.warnings).toContain("响应包含重复节点，已按节点去重统计");
  });

  it("安全归类未知类型和空白原因", () => {
    const summary = summarizeFormsImpact([
      item("unknown-1", "future_type" as FormsImpactItemV2["node_type"], "  ")
    ]);
    expect(summary.type_counts).toEqual([{ label: "其他类型", count: 1 }]);
    expect(summary.groups[0]?.reason).toBe("未说明原因");
    expect(summary.warnings).toEqual([
      "响应包含未知节点类型，已归入其他类型",
      "部分受影响节点未说明原因"
    ]);
  });

  it("空 affected 阻止确认", () => {
    expect(summarizeFormsImpact([])).toMatchObject({
      affected_count: 0,
      groups: [],
      can_confirm: false,
      warnings: ["服务未返回受影响节点，无法确认本次影响"]
    });
  });
});
