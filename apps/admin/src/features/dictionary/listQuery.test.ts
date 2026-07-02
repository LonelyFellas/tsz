import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { toListQuery } from "./listQuery";

describe("toListQuery — 搜索行 → 列表查询参数", () => {
  it("空筛选只带分页参数", () => {
    expect(toListQuery({}, 1, 20)).toEqual({ page: 1, page_size: 20 });
  });

  it("文本参数去首尾空白,空白串不带参", () => {
    const q = toListQuery({ keyword: "  take ", gloss: "   " }, 2, 50);
    expect(q).toEqual({ page: 2, page_size: 50, q: "take" });
  });

  it("枚举筛选原样透传", () => {
    const q = toListQuery(
      { kind: "phrase", pos: "verb", level: "B1", status: "draft" },
      1,
      20
    );
    expect(q).toMatchObject({
      kind: "phrase",
      pos: "verb",
      level: "B1",
      status: "draft"
    });
  });

  it("创建时间映射为 RFC3339 半开区间:to 为结束日次日零点", () => {
    const from = dayjs("2026-07-01T15:30:00");
    const to = dayjs("2026-07-02T08:00:00");
    const q = toListQuery({ range: [from, to] }, 1, 20);
    expect(q.created_from).toBe(from.startOf("day").toISOString());
    expect(q.created_to).toBe(to.add(1, "day").startOf("day").toISOString());
    // 半开区间 [from, to):结束边界必须晚于结束日内的任何时刻。
    expect(dayjs(q.created_to).isAfter(to.endOf("day"))).toBe(true);
  });

  it("range 半开(只选起点)或为 null 时不带对应参数", () => {
    expect(toListQuery({ range: null }, 1, 20)).toEqual({
      page: 1,
      page_size: 20
    });
    const q = toListQuery({ range: [dayjs("2026-07-01"), null] }, 1, 20);
    expect(q.created_from).toBeDefined();
    expect(q.created_to).toBeUndefined();
  });
});
