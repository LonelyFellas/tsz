import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { User } from "@tsz/types";
import { HomeNav } from "./HomeNav";
import { useUserStore } from "@/stores/user";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: {
    auth: { logout: vi.fn() },
    coins: { wallet: vi.fn().mockResolvedValue({ balance: "5" }) }
  }
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
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("HomeNav", () => {
  it("会话恢复中 → 不渲染登录链接,也不渲染账户菜单", () => {
    render(<HomeNav />);
    expect(screen.queryByText("登录")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "账户菜单" })
    ).not.toBeInTheDocument();
  });

  it("未登录 → 显示登录链接,指向 /login", () => {
    useUserStore.setState({ hydrated: true, user: null });
    render(<HomeNav />);
    expect(screen.getByText("登录").closest("a")).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("已登录可通过齿轮打开外观设置，切换账号关闭旧面板", async () => {
    useUserStore.setState({ hydrated: true, user: USER });
    const actions = userEvent.setup();
    const view = render(<HomeNav />);
    await actions.click(screen.getByRole("button", { name: "偏好设置" }));
    expect(
      screen.getByRole("dialog", { name: "偏好设置" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "跟随系统" })
    ).toBeInTheDocument();
    useUserStore.setState({ user: { ...USER, id: "u2" } });
    view.rerender(<HomeNav />);
    expect(
      screen.queryByRole("dialog", { name: "偏好设置" })
    ).not.toBeInTheDocument();
  });

  it("首页设置与账户互斥，设置打开时不响应头像悬停", async () => {
    useUserStore.setState({ hydrated: true, user: USER });
    const actions = userEvent.setup();
    renderWithProviders(<HomeNav />);
    await actions.click(screen.getByRole("button", { name: "偏好设置" }));
    const event = new MouseEvent("pointerover", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(screen.getByRole("button", { name: "账户菜单" }), event);
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await actions.click(screen.getByRole("button", { name: "账户菜单" }));
    await screen.findByRole("menu");
    expect(
      screen.queryByRole("dialog", { name: "偏好设置" })
    ).not.toBeInTheDocument();
    await actions.click(screen.getByRole("button", { name: "偏好设置" }));
    expect(
      screen.getByRole("dialog", { name: "偏好设置" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
  });

  it("已登录 → 显示账户菜单头像,不再平铺登录", () => {
    useUserStore.setState({ hydrated: true, user: USER });
    render(<HomeNav />);
    expect(
      screen.getByRole("button", { name: "账户菜单" })
    ).toBeInTheDocument();
    expect(screen.queryByText("登录")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "偏好设置" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /切换到.*色模式/ })
    ).not.toBeInTheDocument();
  });
});
