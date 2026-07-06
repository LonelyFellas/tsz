import dayjs from "dayjs";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserListParams } from "./listQuery";
import {
  __resetMockUsers,
  mockDeleteUser,
  mockListUsers,
  mockSetUserStatus,
  mockUpdateUser
} from "./mock";

const params = (over: Partial<UserListParams> = {}): UserListParams => ({
  filters: {},
  role: "all",
  page: 1,
  pageSize: 100,
  ...over
});

beforeEach(() => __resetMockUsers());

describe("mockListUsers", () => {
  it("默认返回全部，分页信息正确", () => {
    const res = mockListUsers(params());
    expect(res.page.total).toBe(16);
    expect(res.items.length).toBe(16);
    expect(res.page).toEqual({ page: 1, page_size: 100, total: 16 });
  });

  it("分页切片：第 2 页取剩余", () => {
    expect(mockListUsers(params({ pageSize: 10, page: 1 })).items).toHaveLength(
      10
    );
    expect(mockListUsers(params({ pageSize: 10, page: 2 })).items).toHaveLength(
      6
    );
  });

  it("role 过滤只返回该角色", () => {
    const teachers = mockListUsers(params({ role: "teacher" }));
    expect(teachers.page.total).toBeGreaterThan(0);
    expect(teachers.items.every((u) => u.roles.includes("teacher"))).toBe(true);

    const students = mockListUsers(params({ role: "student" }));
    expect(students.items.every((u) => u.roles.includes("student"))).toBe(true);
  });

  it("昵称模糊过滤", () => {
    const res = mockListUsers(params({ filters: { nickname: "record" } }));
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((u) => u.display_name.includes("record"))).toBe(
      true
    );
  });

  it("手机号过滤（无手机的行被排除）", () => {
    const withPhone = mockListUsers(params()).items.find((u) => u.phone)!;
    const res = mockListUsers(
      params({ filters: { phone: withPhone.phone!.slice(0, 6) } })
    );
    expect(res.items.length).toBeGreaterThan(0);
    expect(
      res.items.every((u) =>
        (u.phone ?? "").includes(withPhone.phone!.slice(0, 6))
      )
    ).toBe(true);
  });

  it("邮箱过滤", () => {
    const res = mockListUsers(params({ filters: { email: "record" } }));
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((u) => (u.email ?? "").includes("record"))).toBe(
      true
    );
  });

  it("注册日期精确过滤到某天", () => {
    const res = mockListUsers(
      params({ filters: { registeredDate: dayjs("2025-11-02") } })
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.created_at.startsWith("2025-11-02")).toBe(true);
  });
});

describe("mock 写操作", () => {
  it("mockUpdateUser 改昵称", () => {
    const id = mockListUsers(params()).items[0]!.id;
    mockUpdateUser(id, { display_name: "改了" });
    expect(
      mockListUsers(params()).items.find((u) => u.id === id)!.display_name
    ).toBe("改了");
  });

  it("mockUpdateUser 对不存在 id 静默不抛", () => {
    expect(() => mockUpdateUser("nope", { display_name: "x" })).not.toThrow();
  });

  it("mockDeleteUser 从列表移除", () => {
    const id = mockListUsers(params()).items[0]!.id;
    mockDeleteUser(id);
    const after = mockListUsers(params());
    expect(after.page.total).toBe(15);
    expect(after.items.find((u) => u.id === id)).toBeUndefined();
  });

  it("mockSetUserStatus 切换状态", () => {
    const id = mockListUsers(params()).items[0]!.id;
    mockSetUserStatus(id, "disabled");
    expect(mockListUsers(params()).items.find((u) => u.id === id)!.status).toBe(
      "disabled"
    );
  });

  it("mockSetUserStatus 对不存在 id 静默不抛", () => {
    expect(() => mockSetUserStatus("nope", "active")).not.toThrow();
  });
});
