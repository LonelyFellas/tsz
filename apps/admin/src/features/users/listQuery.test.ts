import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { toUserListQuery } from "./listQuery";

describe("toUserListQuery", () => {
  it("role=all 不带 role，分页始终带", () => {
    const q = toUserListQuery({
      filters: {},
      role: "all",
      page: 2,
      pageSize: 20
    });
    expect(q).toEqual({ page: 2, page_size: 20 });
  });

  it("role=teacher/student 透传", () => {
    expect(
      toUserListQuery({ filters: {}, role: "teacher", page: 1, pageSize: 10 })
        .role
    ).toBe("teacher");
    expect(
      toUserListQuery({ filters: {}, role: "student", page: 1, pageSize: 10 })
        .role
    ).toBe("student");
  });

  it("q trim 后透传", () => {
    const q = toUserListQuery({
      filters: { q: " alice " },
      role: "all",
      page: 1,
      pageSize: 10
    });
    expect(q.q).toBe("alice");
  });

  it("全为空白的 filters 不带 q", () => {
    const q = toUserListQuery({
      filters: { q: "  " },
      role: "all",
      page: 1,
      pageSize: 10
    });
    expect(q.q).toBeUndefined();
  });

  it("registeredDate 映射为半开区间 [当日 00:00, 次日 00:00)", () => {
    // 用本地日期（非带 Z 的时刻）构造，避免因运行机时区把「当日」推到隔壁天。
    const day = dayjs("2026-06-15").hour(13).minute(45);
    const q = toUserListQuery({
      filters: { registeredDate: day },
      role: "all",
      page: 1,
      pageSize: 10
    });
    // camelCase 表单字段不进 wire；下传的是 snake_case 时间区间。
    expect("registeredDate" in q).toBe(false);
    const from = dayjs(q.registered_from);
    const to = dayjs(q.registered_to);
    expect(from.isSame(day.startOf("day"))).toBe(true);
    // 半开区间：上界正好是下界 + 1 天。
    expect(to.isSame(from.add(1, "day"))).toBe(true);
  });

  it("无 registeredDate 时不带时间参数", () => {
    const q = toUserListQuery({
      filters: { q: "alice" },
      role: "all",
      page: 1,
      pageSize: 10
    });
    expect(q.registered_from).toBeUndefined();
    expect(q.registered_to).toBeUndefined();
  });
});
