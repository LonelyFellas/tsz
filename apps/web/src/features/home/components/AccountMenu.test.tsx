import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { AccountMenu } from "./AccountMenu";
import { useUserStore } from "@/stores/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";

vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: vi.fn()
}));

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/request", () => ({
  clearSession: vi.fn(),
  api: { auth: { logout: vi.fn().mockResolvedValue(undefined) } }
}));

import { api, clearSession } from "@/lib/request";

const USER: User = {
  id: "u1",
  phone: "13800138000",
  display_name: "Alice",
  roles: ["student"],
  avatar_url: "",
  active_role: "student"
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
  vi.mocked(useTeacherIdentity).mockReturnValue({
    identity: "student",
    verified: false,
    ready: true,
    error: false,
    select: vi.fn().mockResolvedValue(undefined)
  });
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
      user: { ...USER, display_name: undefined } as unknown as User
    });
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: "账户菜单" })).toHaveTextContent(
      "用"
    );
  });

  it("有头像 → 渲染头像图片", () => {
    useUserStore.setState({
      user: { ...USER, avatar_url: "https://example.com/a.png" }
    });
    render(<AccountMenu />);
    const img = screen.getByRole("img", { name: "Alice" });
    expect(img).toHaveAttribute("src", "https://example.com/a.png");
  });

  it("头像加载失败 → 回退首字母;avatar_url 更新(换头像)后自动重试新图", () => {
    useUserStore.setState({
      user: { ...USER, avatar_url: "https://example.com/old.png" }
    });
    render(<AccountMenu />);

    // 旧图加载失败 → 回退首字母。
    fireEvent.error(screen.getByRole("img", { name: "Alice" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "账户菜单" })).toHaveTextContent(
      "A"
    );

    // 换头像后 store 更新(URL 版本化必然不同)→ 失败记录不适用于新 URL,应重试渲染。
    act(() => {
      useUserStore.setState({
        user: { ...USER, avatar_url: "https://example.com/new.png" }
      });
    });
    expect(screen.getByRole("img", { name: "Alice" })).toHaveAttribute(
      "src",
      "https://example.com/new.png"
    );
  });

  it("点击头像 → 展开常用入口，注销移至账号安全", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);

    expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    expect(screen.getByText("退出登录")).toBeInTheDocument();
    expect(screen.getByText("当前身份：学生")).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["进入学生工作台", "个人中心", "站内通知", "申请教师认证"]
    );
    expect(
      screen.getByRole("link", { name: "进入学生工作台" })
    ).toHaveAttribute("href", "/student/practice");
    expect(screen.queryByText("注销账号")).not.toBeInTheDocument();
  });

  it.each(["student", "teacher"] as const)(
    "已认证教师在 %s 工作台 → 显示当前入口和另一工作台切换",
    async (identity) => {
      const select = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useTeacherIdentity).mockReturnValue({
        identity,
        verified: true,
        ready: true,
        error: false,
        select
      });
      useUserStore.setState({ user: USER });
      const user = userEvent.setup();
      render(<AccountMenu />);
      await user.click(screen.getByRole("button", { name: "账户菜单" }));
      expect(
        screen.getByRole("link", {
          name: identity === "teacher" ? "进入教师工作台" : "进入学生工作台"
        })
      ).toHaveAttribute(
        "href",
        identity === "teacher" ? "/teacher/classes" : "/student/practice"
      );
      expect(screen.queryByText("申请教师认证")).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", {
          name: identity === "teacher" ? "切换到学生工作台" : "切换到教师工作台"
        })
      );
      expect(select).toHaveBeenCalledWith(
        identity === "teacher" ? "student" : "teacher"
      );
      expect(screen.getByRole("button", { name: "账户菜单" })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
    }
  );

  it("点击退出登录 → 调后端登出、清 token、跳登录页", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    await user.click(screen.getByText("退出登录"));

    await waitFor(() => {
      expect(api.auth.logout).toHaveBeenCalled();
      expect(clearSession).toHaveBeenCalledTimes(1);
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
