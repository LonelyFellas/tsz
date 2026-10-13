import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { AppTopbar } from "./AppTopbar";

const identity = vi.hoisted(() => ({
  identity: "student" as "student" | "teacher",
  verified: false
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/teacher/tasks/abc",
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: () => identity
}));
vi.mock("@/features/home/components/AccountMenu", () => ({
  AccountMenu: () => <button>账户</button>
}));

const teacher: User = {
  id: "teacher-a",
  display_name: "老师",
  phone: "13800138000",
  roles: ["student", "teacher"],
  avatar_url: "",
  active_role: "teacher"
};

beforeEach(() => {
  identity.identity = "student";
  identity.verified = false;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
});

it("游客只看到词库广场、外观设置与登录入口", async () => {
  useUserStore.setState({ user: null, hydrated: true });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute(
    "href",
    "/login"
  );
  await actions.click(screen.getByRole("button", { name: "网站菜单" }));
  const menu = screen.getByRole("dialog", { name: "网站菜单" });
  expect(
    within(menu)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
  ).toEqual(["/wordlists", "/"]);
  await actions.click(screen.getByRole("button", { name: "设置" }));
  const settings = screen.getByRole("dialog", { name: "设置" });
  expect(
    within(settings).getByRole("button", { name: "跟随系统" })
  ).toBeInTheDocument();
  expect(within(settings).queryByText("英美偏好")).not.toBeInTheDocument();
});

it("已认证教师看到教学菜单并高亮当前页", async () => {
  identity.identity = "teacher";
  identity.verified = true;
  useUserStore.setState({ user: teacher, hydrated: true });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  await actions.click(screen.getByRole("button", { name: "教学菜单" }));
  const menu = screen.getByRole("dialog", { name: "教学菜单" });
  expect(within(menu).getByRole("link", { name: "教学任务" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect(
    within(menu).queryByRole("link", { name: "学习首页" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
});
