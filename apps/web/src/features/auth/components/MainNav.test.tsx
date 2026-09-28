import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, User } from "@tsz/types";
import { MainNav } from "./MainNav";
import { useUserStore } from "@/stores/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";

vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: { auth: { logout: vi.fn() } }
}));

function userWithRoles(roles: Role[]): User {
  return {
    id: "u1",
    phone: "13800138000",
    display_name: "Alice",
    roles,
    avatar_url: "",
    active_role: "student"
  };
}

beforeEach(() => {
  useUserStore.setState({ user: null });
  vi.mocked(useTeacherIdentity).mockReturnValue({
    identity: "student",
    verified: false,
    ready: true,
    error: false,
    select: vi.fn()
  });
});

describe("MainNav — 角色感知导航", () => {
  it("学生 → 显示练习/天生币 + 申请成为老师，不显示教师入口", () => {
    useUserStore.setState({ user: userWithRoles(["student"]) });
    render(<MainNav />);

    expect(screen.getByText("练习")).toBeInTheDocument();
    expect(screen.getByText("天生币")).toBeInTheDocument();
    expect(screen.getByText("申请成为老师")).toBeInTheDocument();
    expect(screen.queryByText("任务管理")).not.toBeInTheDocument();
  });

  it("教师 → 显示任务/班级/统计，不显示学生入口与申请入口", () => {
    useUserStore.setState({ user: userWithRoles(["student", "teacher"]) });
    vi.mocked(useTeacherIdentity).mockReturnValue({
      identity: "teacher",
      verified: true,
      ready: true,
      error: false,
      select: vi.fn()
    });
    render(<MainNav />);

    expect(screen.getByText("任务管理")).toBeInTheDocument();
    expect(screen.getByText("班级管理")).toBeInTheDocument();
    expect(screen.getByText("数据统计")).toBeInTheDocument();
    expect(screen.queryByText("练习")).not.toBeInTheDocument();
    expect(screen.queryByText("申请成为老师")).not.toBeInTheDocument();
  });

  it("师生双身份选择学生工作台 → 只显示学生入口，无申请入口", () => {
    useUserStore.setState({ user: userWithRoles(["student", "teacher"]) });
    vi.mocked(useTeacherIdentity).mockReturnValue({
      identity: "student",
      verified: true,
      ready: true,
      error: false,
      select: vi.fn()
    });
    render(<MainNav />);

    expect(screen.getByText("练习")).toBeInTheDocument();
    expect(screen.queryByText("任务管理")).not.toBeInTheDocument();
    expect(screen.queryByText("申请成为老师")).not.toBeInTheDocument();
  });

  it("未认证即使保留教师偏好也不能显示教师入口", () => {
    useUserStore.setState({ user: userWithRoles(["student", "teacher"]) });
    vi.mocked(useTeacherIdentity).mockReturnValue({
      identity: "teacher",
      verified: false,
      ready: true,
      error: false,
      select: vi.fn()
    });
    render(<MainNav />);
    expect(screen.getByText("练习")).toBeInTheDocument();
    expect(screen.queryByText("任务管理")).not.toBeInTheDocument();
    expect(screen.getByText("申请成为老师")).toBeInTheDocument();
  });

  it("无用户 → 仅词表与申请入口（修复 getSession 占位导致入口从不显示的问题）", () => {
    useUserStore.setState({ user: null });
    render(<MainNav />);

    expect(screen.getByText("词表")).toBeInTheDocument();
    expect(screen.getByText("申请成为老师")).toBeInTheDocument();
    expect(screen.queryByText("练习")).not.toBeInTheDocument();
    expect(screen.queryByText("任务管理")).not.toBeInTheDocument();
  });
});
