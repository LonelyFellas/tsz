import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { RouteGuard } from "./RouteGuard";
import { useUserStore } from "@/stores/user";

const mockReplace = vi.fn();
let mockPathname = "/wordlists";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname
}));

const USER: User = {
  id: "u1",
  phone: "13800138000",
  display_name: "Alice",
  roles: ["student"],
  avatar_url: "",
  status: "active",
  created_at: "",
  updated_at: ""
};

function setState(s: Partial<ReturnType<typeof useUserStore.getState>>) {
  useUserStore.setState(s);
}

beforeEach(() => {
  mockReplace.mockReset();
  mockPathname = "/wordlists";
  setState({ user: null, onboarded: null, hydrated: false });
});

describe("RouteGuard", () => {
  it("会话恢复中（未 hydrated）→ 显示加载态，不重定向", () => {
    render(
      <RouteGuard>
        <p>受保护内容</p>
      </RouteGuard>
    );
    expect(screen.getByText("加载中...")).toBeInTheDocument();
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("已恢复但未登录 → 跳 /login 并带 redirect", async () => {
    setState({ hydrated: true, user: null });
    render(
      <RouteGuard>
        <p>受保护内容</p>
      </RouteGuard>
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?redirect=%2Fwordlists");
    });
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();
  });

  it("已登录但未完成引导且页面要求引导 → 跳 /onboarding", async () => {
    setState({ hydrated: true, user: USER, onboarded: false });
    render(
      <RouteGuard requireOnboarding>
        <p>受保护内容</p>
      </RouteGuard>
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("已登录且已完成引导 → 渲染子内容", () => {
    setState({ hydrated: true, user: USER, onboarded: true });
    render(
      <RouteGuard requireOnboarding>
        <p>受保护内容</p>
      </RouteGuard>
    );
    expect(screen.getByText("受保护内容")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("不要求引导时，未完成引导也可访问", () => {
    setState({ hydrated: true, user: USER, onboarded: false });
    render(
      <RouteGuard>
        <p>受保护内容</p>
      </RouteGuard>
    );
    expect(screen.getByText("受保护内容")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
