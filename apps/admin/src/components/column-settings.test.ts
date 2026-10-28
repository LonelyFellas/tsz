import { describe, expect, it } from "vitest";
import {
  readColumnPreferences,
  resolveColumns,
  type ConfigurableColumn
} from "./column-settings";

const defaults: ConfigurableColumn[] = [
  { key: "name", label: "名称", visible: true, fixed: false },
  { key: "status", label: "状态", visible: true, fixed: false },
  { key: "actions", label: "操作", visible: true, fixed: "right" }
];

describe("表格列偏好", () => {
  it("忽略损坏缓存、非法项和重复项", () => {
    expect(readColumnPreferences("invalid")).toEqual([]);
    expect(readColumnPreferences('{"name":true}')).toEqual([]);
    expect(
      readColumnPreferences(
        JSON.stringify([
          null,
          { key: "name", visible: true, fixed: "left" },
          { key: "name", visible: false, fixed: false },
          { key: "status", visible: "false", fixed: false },
          { key: "actions", visible: true, fixed: "invalid" }
        ])
      )
    ).toEqual([{ key: "name", visible: true, fixed: "left" }]);
  });

  it("按缓存排序，移除失效列并保留新增列默认值，左右固定列分别归边", () => {
    const result = resolveColumns(defaults, [
      { key: "removed", visible: true, fixed: false },
      { key: "actions", visible: true, fixed: "left" },
      { key: "name", visible: false, fixed: "right" }
    ]);
    expect(
      result.map(({ key, visible, fixed }) => ({ key, visible, fixed }))
    ).toEqual([
      { key: "actions", visible: true, fixed: "left" },
      { key: "status", visible: true, fixed: false },
      { key: "name", visible: false, fixed: "right" }
    ]);
    expect(defaults.map((column) => column.key)).toEqual([
      "name",
      "status",
      "actions"
    ]);
  });

  it("列被移除后仍至少保留一列可见", () => {
    expect(
      resolveColumns(defaults.slice(0, 1), [
        { key: "name", visible: false, fixed: false },
        { key: "removed", visible: true, fixed: false }
      ])[0]?.visible
    ).toBe(true);
  });
});
