import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { User } from "@tsz/types";
import { HomeNav } from "./HomeNav";
import { useUserStore } from "@/stores/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: {
    coins: { wallet: vi.fn().mockResolvedValue({ balance: "5" }) },
    teacherCertification: {
      notifications: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0, unread_count: 0 })
    },
    auth: {
      logout: vi.fn(),
      me: vi.fn().mockResolvedValue({
        learning_settings: { cefr_level: "A1", english_variant: "BrE" }
      })
    }
  }
}));

vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: vi
    .fn()
    .mockReturnValue({ identity: "student", verified: false, ready: true })
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
  vi.mocked(useTeacherIdentity).mockReturnValue({
    identity: "student",
    verified: false,
    ready: true,
    error: false,
    select: vi.fn()
  });
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

  it("已登录从头像打开外观和学习偏好，切换账号关闭旧面板", async () => {
    useUserStore.setState({ hydrated: true, user: USER });
    const actions = userEvent.setup();
    const view = render(<HomeNav />);
    if (!screen.queryByRole("menu"))
      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }), {
        detail: 0
      });
    await actions.click(
      await screen.findByRole("menuitem", { name: "偏好设置" })
    );
    expect(
      screen.getByRole("dialog", { name: "偏好设置" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "跟随系统" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("radio", { name: "英式英语" })
    ).toBeChecked();
    useUserStore.setState({ user: { ...USER, id: "u2" } });
    view.rerender(<HomeNav />);
    expect(
      screen.queryByRole("dialog", { name: "偏好设置" })
    ).not.toBeInTheDocument();
  });

  it("首页教学视角只显示外观，不显示学生学习偏好", async () => {
    useUserStore.setState({
      hydrated: true,
      user: { ...USER, roles: ["student", "teacher"] }
    });
    vi.mocked(useTeacherIdentity).mockReturnValue({
      identity: "teacher",
      verified: true,
      ready: true,
      error: false,
      select: vi.fn()
    });
    const actions = userEvent.setup();
    render(<HomeNav />);
    fireEvent.click(screen.getByRole("button", { name: "账户菜单" }), {
      detail: 0
    });
    await actions.click(
      await screen.findByRole("menuitem", { name: "偏好设置" })
    );
    expect(
      screen.getByRole("button", { name: "跟随系统" })
    ).toBeInTheDocument();
    expect(screen.queryByText("英美偏好")).not.toBeInTheDocument();
  });

  it("首页偏好与账户菜单并存，点击外部关闭两层", async () => {
    useUserStore.setState({ hydrated: true, user: USER });
    const actions = userEvent.setup();
    render(<HomeNav />);
    fireEvent.click(screen.getByRole("button", { name: "账户菜单" }), {
      detail: 0
    });
    await actions.click(
      await screen.findByRole("menuitem", { name: "偏好设置" })
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "偏好设置" })
    ).toBeInTheDocument();
    await actions.click(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "偏好设置" })
      ).not.toBeInTheDocument();
    });
  });

  it("已登录 → 显示账户菜单头像,不再平铺登录", () => {
    useUserStore.setState({ hydrated: true, user: USER });
    render(<HomeNav />);
    expect(
      screen.getByRole("button", { name: "账户菜单" })
    ).toBeInTheDocument();
    expect(screen.queryByText("登录")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "站内通知" })).toHaveAttribute(
      "href",
      "/account/notifications"
    );
    expect(
      screen.queryByRole("button", { name: "偏好设置" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /切换到.*色模式/ })
    ).not.toBeInTheDocument();
  });
});
