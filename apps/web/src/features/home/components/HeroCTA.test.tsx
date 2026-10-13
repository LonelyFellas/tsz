import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { HeroCTA } from "./HeroCTA";
import { useUserStore } from "@/stores/user";

const workspace = vi.hoisted(() => ({ identity: "student", verified: false }));
vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: () => workspace
}));

const USER: User = {
  id: "u1",
  phone: "13800138000",
  display_name: "Alice",
  roles: ["student"],
  avatar_url: "",
  active_role: "student"
};

beforeEach(() => {
  workspace.identity = "student";
  workspace.verified = false;
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("HeroCTA", () => {
  it("会话恢复中 → 占位,不渲染任何链接", () => {
    render(<HeroCTA />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("未登录 → 登录 + 浏览词表,各自 href", () => {
    useUserStore.setState({ hydrated: true, user: null });
    render(<HeroCTA />);
    expect(screen.getByText("登录").closest("a")).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByText("浏览词表 ›").closest("a")).toHaveAttribute(
      "href",
      "/wordlists"
    );
  });

  it("已登录且已引导 → 进入学习指向学习首页", () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
    render(<HeroCTA />);
    expect(screen.getByText("进入学习").closest("a")).toHaveAttribute(
      "href",
      "/student/home"
    );
  });

  it("未引导学生也进入学习首页，由守卫保留回跳地址", () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: false });
    render(<HeroCTA />);
    expect(screen.getByText("进入学习").closest("a")).toHaveAttribute(
      "href",
      "/student/home"
    );
  });
});

it("教师工作台使用教学入口", () => {
  workspace.identity = "teacher";
  workspace.verified = true;
  useUserStore.setState({ hydrated: true, user: USER, onboarded: false });
  render(<HeroCTA />);
  expect(screen.getByRole("link", { name: "进入教学" })).toHaveAttribute(
    "href",
    "/teacher/classes"
  );
});
