import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { GuestGuard } from "./GuestGuard";
import { useUserStore } from "@/stores/user";

const mockReplace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParams
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
  mockReplace.mockReset();
  searchParams = new URLSearchParams();
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("GuestGuard", () => {
  it("未登录 → 渲染登录/注册内容", () => {
    useUserStore.setState({ hydrated: true, user: null });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    expect(screen.getByText("登录表单")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("恢复中也先渲染表单（避免闪烁）", () => {
    useUserStore.setState({ hydrated: false, user: null });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    expect(screen.getByText("登录表单")).toBeInTheDocument();
  });

  it("已登录且已完成引导 → 跳首页", async () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByText("登录表单")).not.toBeInTheDocument();
  });

  it("已有会话访问登录页也使用安全回跳目标", async () => {
    searchParams.set("redirect", "/student/practice?unit=2#words");
    useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/student/practice?unit=2#words")
    );
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("引导状态尚未确定时不抢跳首页", () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: null });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("登录表单")).toBeVisible();
  });

  it("已登录但未完成引导 → 跳 /onboarding", async () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: false });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/onboarding");
    });
  });
});

it.each([true, false])(
  "纯邮箱账号（onboarded=%s）优先补绑，保留回跳目标",
  async (onboarded) => {
    searchParams.set("redirect", "/student/practice?unit=2");
    useUserStore.setState({
      user: { ...USER, phone: undefined, email: "only@example.com" },
      hydrated: true,
      onboarded
    });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/bind-phone?redirect=%2Fstudent%2Fpractice%3Funit%3D2"
      )
    );
    expect(screen.queryByText("登录表单")).not.toBeInTheDocument();
  }
);

const initialGuestTestUrl = window.location.href;
afterEach(() => {
  window.history.replaceState({}, "", initialGuestTestUrl);
  window.sessionStorage.removeItem("tsz:test-resource-run");
});

it("已有用户态跳离登录页前保留新的测试批次", async () => {
  window.history.replaceState({}, "", "/login?tsz_test_run=fixture-20261017");
  useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
  const atNavigation: (string | null)[] = [];
  mockReplace.mockImplementation(() =>
    atNavigation.push(window.sessionStorage.getItem("tsz:test-resource-run"))
  );
  render(
    <GuestGuard>
      <p>登录表单</p>
    </GuestGuard>
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(atNavigation).toEqual(["fixture-20261017"]);
});
