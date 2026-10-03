import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { AccountMenu } from "./AccountMenu";
import { useUserStore } from "@/stores/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";

vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: vi.fn()
}));

const mockPush = vi.fn();
const mockAssign = vi.fn();

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
  vi.stubGlobal(
    "window",
    new Proxy(window, {
      get(target, key) {
        return key === "location"
          ? { ...target.location, assign: mockAssign }
          : Reflect.get(target, key, target);
      }
    })
  );
  vi.mocked(useTeacherIdentity).mockReturnValue({
    identity: "student",
    verified: false,
    ready: true,
    error: false,
    select: vi.fn().mockResolvedValue(undefined)
  });
  useUserStore.setState({ user: null, onboarded: null, hydrated: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("AccountMenu", () => {
  it("未登录 → 不渲染任何东西", () => {
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["alice", "A"],
    ["中文昵称", "中"],
    ["😀😃", "😀"],
    ["", "用"],
    ["   ", "用"]
  ])("默认头像展示完整首码点：%j → %s", (displayName, initial) => {
    useUserStore.setState({ user: { ...USER, display_name: displayName } });
    render(<AccountMenu />);

    expect(screen.getByRole("button", { name: "账户菜单" }).textContent).toBe(
      initial
    );
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

  it("仅click激活打开菜单，普通指针点击不重复切换", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: "账户菜单" });
    fireEvent.click(trigger, { detail: 0 });
    expect(screen.getByRole("menu")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("修饰键Enter保留链接的原生激活，不生成无修饰键点击", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    const link = screen.getByRole("menuitem", { name: "个人中心" });
    const click = vi.fn();
    link.addEventListener("click", click);
    expect(fireEvent.keyDown(link, { key: "Enter", metaKey: true })).toBe(true);
    expect(click).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(link, { key: "Enter", ctrlKey: true })).toBe(true);
    expect(click).not.toHaveBeenCalled();
    fireEvent.keyDown(link, { key: "Enter" });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "Tab退出保留原生默认行为且不抢回随后焦点，shift=%s",
    async (shiftKey) => {
      useUserStore.setState({ user: USER });
      const user = userEvent.setup();
      render(
        <>
          <AccountMenu />
          <button type="button">后续按钮</button>
        </>
      );
      await user.click(screen.getByRole("button", { name: "账户菜单" }));
      const link = screen.getByRole("menuitem", { name: "个人中心" });
      link.focus();
      expect(fireEvent.keyDown(link, { key: "Tab", shiftKey })).toBe(true);
      const outside = screen.getByRole("button", { name: "后续按钮" });
      outside.focus();
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      );
      expect(outside).toHaveFocus();
    }
  );

  it("点击头像 → 展开常用入口，注销移至账号安全", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);

    expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    expect(screen.getByText("退出登录")).toBeInTheDocument();
    expect(screen.getByText("当前身份：学生")).toBeInTheDocument();
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual([
      "进入学生工作台",
      "个人中心",
      "站内通知",
      "申请教师认证",
      "退出登录"
    ]);
    expect(
      screen.getByRole("menuitem", { name: "进入学生工作台" })
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
        screen.getByRole("menuitem", {
          name: identity === "teacher" ? "进入教师工作台" : "进入学生工作台"
        })
      ).toHaveAttribute(
        "href",
        identity === "teacher" ? "/teacher/classes" : "/student/practice"
      );
      expect(screen.queryByText("申请教师认证")).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("menuitem", {
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
      expect(mockAssign).toHaveBeenCalledWith("/login");
    });
  });

  it("菜单经 Portal 渲染，外部点击关闭并保留外部焦点", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    const { container } = render(
      <div className="animate-in">
        <AccountMenu />
        <button type="button">页面按钮</button>
      </div>
    );
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    const menu = screen.getByRole("menu");
    expect(container).not.toContainElement(menu);
    expect(document.body).toContainElement(menu);
    const outside = screen.getByRole("button", { name: "页面按钮" });
    await user.click(outside);
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
    expect(outside).toHaveFocus();
  });

  it("键盘打开后支持方向键，Esc 关闭并返回头像焦点", async () => {
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: "账户菜单" });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "进入学生工作台" })
      ).toHaveFocus()
    );
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "个人中心" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("身份切换失败保持菜单打开，可重试成功", async () => {
    const select = vi
      .fn()
      .mockRejectedValueOnce(new Error("切换失败，请重试"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(useTeacherIdentity).mockReturnValue({
      identity: "student",
      verified: true,
      ready: true,
      error: false,
      select
    });
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    await user.click(
      screen.getByRole("menuitem", { name: "切换到教师工作台" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "切换失败，请重试"
    );
    expect(screen.getByRole("menu")).toBeVisible();
    await user.click(
      screen.getByRole("menuitem", { name: "切换到教师工作台" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("身份切换等待中保持菜单，禁止重复切换和同时退出", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const select = vi.fn().mockReturnValue(pending);
    vi.mocked(useTeacherIdentity).mockReturnValue({
      identity: "student",
      verified: true,
      ready: true,
      error: false,
      select
    });
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    await user.click(
      screen.getByRole("menuitem", { name: "切换到教师工作台" })
    );
    expect(screen.getByRole("menuitem", { name: "正在切换…" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    for (const name of ["进入学生工作台", "个人中心", "站内通知"]) {
      const link = screen.getByRole("menuitem", { name });
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(fireEvent.click(link)).toBe(false);
      expect(
        fireEvent(
          link,
          new MouseEvent("auxclick", {
            bubbles: true,
            cancelable: true,
            button: 1
          })
        )
      ).toBe(false);
    }
    await user.keyboard("{Enter}");
    expect(select).toHaveBeenCalledTimes(1);
    expect(api.auth.logout).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeVisible();
    await act(async () => resolve());
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
  });

  it("退出等待中不重复请求，也不能同时切换身份", async () => {
    let resolve!: () => void;
    vi.mocked(api.auth.logout).mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    const select = vi.fn();
    vi.mocked(useTeacherIdentity).mockReturnValue({
      identity: "student",
      verified: true,
      ready: true,
      error: false,
      select
    });
    useUserStore.setState({ user: USER });
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: "账户菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));
    expect(screen.getByRole("menuitem", { name: "退出中…" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(
      screen.getByRole("menuitem", { name: "切换到教师工作台" })
    ).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter}");
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    await act(async () => resolve());
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/login"));
    expect(clearSession).toHaveBeenCalledTimes(1);
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
