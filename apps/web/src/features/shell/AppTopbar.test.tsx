import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { AppTopbar } from "./AppTopbar";

const identity = vi.hoisted(() => ({
  identity: "student" as "student" | "teacher",
  verified: false,
  ready: true
}));
const route = vi.hoisted(() => ({ pathname: "/teacher/tasks/abc" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock("@/features/student-home/LearningPreferences", () => ({
  LearningPreferences: () => <p>英美偏好</p>
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

const student: User = {
  id: "student-a",
  display_name: "学生",
  phone: "13800138001",
  roles: ["student"],
  avatar_url: "",
  active_role: "student"
};

function menuLinks(name: string) {
  return within(screen.getByRole("dialog", { name }))
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
}

beforeEach(() => {
  identity.identity = "student";
  identity.verified = false;
  identity.ready = true;
  route.pathname = "/teacher/tasks/abc";
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

it("学生打开学习设置，看到外观与学习偏好", async () => {
  route.pathname = "/student/home";
  useUserStore.setState({ user: student, hydrated: true });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  await actions.click(screen.getByRole("button", { name: "学习设置" }));
  const settings = screen.getByRole("dialog", { name: "学习设置" });
  expect(within(settings).getByText("英美偏好")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "设置" })
  ).not.toBeInTheDocument();
});

it("已认证教师选择学生工作台时显示学习菜单与学习设置", async () => {
  route.pathname = "/student/home";
  identity.verified = true;
  identity.identity = "student";
  useUserStore.setState({ user: teacher, hydrated: true });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  await actions.click(screen.getByRole("button", { name: "学习菜单" }));
  expect(menuLinks("学习菜单")).toContain("/student/practice");
  expect(menuLinks("学习菜单")).not.toContain("/teacher/classes");
  expect(screen.getByRole("button", { name: "学习设置" })).toBeInTheDocument();
});

it("没有学生角色且不在教学工作台的账号只看到精简菜单", async () => {
  route.pathname = "/account/profile";
  useUserStore.setState({
    user: { ...teacher, roles: ["teacher"] },
    hydrated: true
  });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  expect(
    screen.queryByRole("button", { name: "学习菜单" })
  ).not.toBeInTheDocument();
  await actions.click(screen.getByRole("button", { name: "网站菜单" }));
  expect(menuLinks("网站菜单")).toEqual([
    "/account/wordlists",
    "/wordlists",
    "/account/coins",
    "/account/notifications",
    "/account/profile",
    "/"
  ]);
  expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
});

it("首次进入教师页、资格核验返回前不闪出学习菜单", async () => {
  identity.ready = false;
  useUserStore.setState({ user: teacher, hydrated: true });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  expect(
    screen.queryByRole("button", { name: "学习菜单" })
  ).not.toBeInTheDocument();
  await actions.click(screen.getByRole("button", { name: "教学菜单" }));
  expect(menuLinks("教学菜单")).not.toContain("/student/home");
  expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
});

it("左右浮层互斥：打开设置会关闭菜单", async () => {
  route.pathname = "/student/home";
  useUserStore.setState({ user: student, hydrated: true });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  await actions.click(screen.getByRole("button", { name: "学习菜单" }));
  expect(screen.getByRole("dialog", { name: "学习菜单" })).toBeInTheDocument();
  await actions.click(screen.getByRole("button", { name: "学习设置" }));
  expect(screen.getByRole("dialog", { name: "学习设置" })).toBeInTheDocument();
  expect(
    screen.queryByRole("dialog", { name: "学习菜单" })
  ).not.toBeInTheDocument();
  await actions.click(screen.getByRole("button", { name: "学习菜单" }));
  expect(screen.getByRole("dialog", { name: "学习菜单" })).toBeInTheDocument();
  expect(
    screen.queryByRole("dialog", { name: "学习设置" })
  ).not.toBeInTheDocument();
});

it("点击菜单链接后浮层关闭", async () => {
  route.pathname = "/student/home";
  useUserStore.setState({ user: student, hydrated: true });
  const actions = userEvent.setup();
  renderWithProviders(<AppTopbar />);
  await actions.click(screen.getByRole("button", { name: "学习菜单" }));
  await actions.click(
    within(screen.getByRole("dialog", { name: "学习菜单" })).getByRole("link", {
      name: "我的任务"
    })
  );
  expect(
    screen.queryByRole("dialog", { name: "学习菜单" })
  ).not.toBeInTheDocument();
});
