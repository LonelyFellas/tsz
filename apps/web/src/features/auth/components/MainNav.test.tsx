import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, User } from "@tsz/types";
import { MainNav } from "./MainNav";
import { useUserStore } from "@/stores/user";

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
    status: "active",
    created_at: "",
    updated_at: ""
  };
}

beforeEach(() => {
  useUserStore.setState({ user: null });
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
    useUserStore.setState({ user: userWithRoles(["teacher"]) });
    render(<MainNav />);

    expect(screen.getByText("任务管理")).toBeInTheDocument();
    expect(screen.getByText("班级管理")).toBeInTheDocument();
    expect(screen.getByText("数据统计")).toBeInTheDocument();
    expect(screen.queryByText("练习")).not.toBeInTheDocument();
    expect(screen.queryByText("申请成为老师")).not.toBeInTheDocument();
  });

  it("师生双角色 → 同时显示两类入口，无申请入口", () => {
    useUserStore.setState({ user: userWithRoles(["student", "teacher"]) });
    render(<MainNav />);

    expect(screen.getByText("练习")).toBeInTheDocument();
    expect(screen.getByText("任务管理")).toBeInTheDocument();
    expect(screen.queryByText("申请成为老师")).not.toBeInTheDocument();
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
