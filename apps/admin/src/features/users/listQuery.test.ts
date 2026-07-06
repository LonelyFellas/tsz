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

  it("q 由昵称/手机/邮箱拼接、trim、跳过空", () => {
    const q = toUserListQuery({
      filters: { nickname: " alice ", phone: "", email: "a@b.com" },
      role: "all",
      page: 1,
      pageSize: 10
    });
    expect(q.q).toBe("alice a@b.com");
  });

  it("全为空白的 filters 不带 q", () => {
    const q = toUserListQuery({
      filters: { nickname: "  " },
      role: "all",
      page: 1,
      pageSize: 10
    });
    expect(q.q).toBeUndefined();
  });

  it("registeredDate 不进 wire（后端无参数）", () => {
    const q = toUserListQuery({
      filters: { registeredDate: dayjs() },
      role: "all",
      page: 1,
      pageSize: 10
    });
    expect("registeredDate" in q).toBe(false);
    expect(q.q).toBeUndefined();
  });
});
