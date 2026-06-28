import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { AccountMenu } from "./AccountMenu";
import { useUserStore } from "@/stores/user";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: { auth: { logout: vi.fn().mockResolvedValue(undefined) } }
}));

import { api, setAccessToken } from "@/lib/request";

const USER: User = {
  id: "u1",
  phone: "13800138000",
  nickname: "Alice",
  roles: ["student"],
  coins: 0,
  createdAt: ""
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
  useUserStore.setState({ user: null, onboarded: null, hydrated: true });
});

describe("AccountMenu", () => {
  it("未登录 → 不渲染任何东西", () => {
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("无头像 → 头像回退为昵称首字母", () => {
    useUserStore.setState({ user: USER });
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: "账户菜单" })).toHaveTextContent(
      "A"
    );
  });

  it("昵称缺失 → 回退为「用户」/首字「用」", () => {
    useUserStore.setState({
      user: { ...USER, nickname: undefined } as unknown as User
    });
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: "账户菜单" })).toHaveTextContent(
      "用"
    );
  });

  it("有头像 → 渲染头像图片", () => {
    useUserStore.setState({
      user: { ...USER, avatar: "https://example.com/a.png" }
    });
    render(<AccountMenu />);
    const img = screen.getByRole("img", { name: "Alice" });
    expect(img).toHaveAttribute("src", "https://example.com/a.png");
  });

  it("点击头像 → 展开菜单(退出登录 / 注销账号)", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);

    expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    expect(screen.getByText("退出登录")).toBeInTheDocument();
    expect(screen.getByText("注销账号").closest("a")).toHaveAttribute(
      "href",
      "/account/delete"
    );
  });

  it("点击退出登录 → 调后端登出、清 token、跳登录页", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    await user.click(screen.getByText("退出登录"));

    await waitFor(() => {
      expect(api.auth.logout).toHaveBeenCalled();
      expect(setAccessToken).toHaveBeenCalledWith(null);
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("按 Esc → 收起菜单", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    expect(screen.getByText("退出登录")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
    });
  });
});
