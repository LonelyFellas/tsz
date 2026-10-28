import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminProfile, MenuPermission } from "@tsz/types";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth";
import { ConsoleSidebar } from "./ConsoleSidebar";

// useNavigate 用 spy 替换以断言「点击已落地模块 → 跳转」；useLocation 等保留真实实现。
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// 全部可委派权限：普通管理员默认拿全量，等价于旧行为（菜单全出），个别用例再收窄。
const FULL_PERMISSIONS: MenuPermission[] = [
  "users.access",
  "classes.access",
  "words.access",
  "customdict.access",
  "sentences.access",
  "wordlists.access",
  "customwordlist.access",
  "tasks.access",
  "wordlists.review",
  "teacherapply.access",
  "comments.access",
  "coins.access"
];

function setLevel(
  level: "admin" | "super_admin" | null,
  permissions: AdminProfile["permissions"] = FULL_PERMISSIONS
) {
  useAuthStore.getState().setProfile(
    level
      ? {
          id: "a-1",
          phone: "13800138000",
          display_name: "管理员",
          role: level,
          permission_version: 1,
          catalog_version: "catalog-v1",
          permissions,
          preferences: { dialect: "uk" }
        }
      : null
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  // 默认全权普通管理员，使不显式设 profile 的用例仍渲染出全部菜单叶子（旧行为）。
  setLevel("admin");
});
// 侧栏「管理员管理」入口按 level 渲染，且 store 为单例，用例间需复位避免串味。
afterEach(() => setLevel(null));

// 侧栏依赖 react-router 的 useLocation/useNavigate，用 MemoryRouter 提供路由上下文，
// initialEntries 控制当前路径。侧栏已改为 antd Menu，断言其菜单项与禁用态。
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleSidebar />
    </MemoryRouter>
  );
}

describe("ConsoleSidebar", () => {
  it("权限判断与共享内核一致：未知角色携带已知key也不显示业务菜单", () => {
    const current = useAuthStore.getState().profile!;
    useAuthStore.getState().setProfile({
      ...current,
      role: "unknown_role" as never,
      permissions: ["words.access", "users.access"]
    });
    renderAt("/");
    expect(screen.getByText("首页")).toBeInTheDocument();
    expect(screen.queryByText("词库管理")).toBeNull();
    expect(screen.queryByText("用户管理")).toBeNull();
  });
  it("渲染 logo 与各分组标题", () => {
    renderAt("/");
    expect(screen.getByText("天生会背")).toBeInTheDocument();
    for (const group of ["用户管理", "词库管理", "审核管理"]) {
      // 部分分组标题与同名子项重名，可能出现多次。
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
  });

  it("展开用户管理分组：点「用户管理」子项跳转 /users", () => {
    renderAt("/");
    // 分组收起时只有分组标题一个「用户管理」。点它展开分组。
    fireEvent.click(screen.getByText("用户管理"));
    // 展开后分组标题 + 子项同名，取最后一个（子项 leaf）点击。
    const items = screen.getAllByText("用户管理");
    fireEvent.click(items[items.length - 1]!);
    expect(mockNavigate).toHaveBeenCalledWith("/users");
  });

  it("普通 admin：用户管理分组下无「管理员管理」入口", () => {
    setLevel("admin");
    renderAt("/");
    fireEvent.click(screen.getByText("用户管理"));
    expect(screen.queryByText("管理员管理")).toBeNull();
  });

  it("按后端权限过滤菜单：只有 words.access 时词库与配音中心可见", () => {
    setLevel("admin", ["words.access"]);
    renderAt("/");
    expect(screen.getByText("词库管理")).toBeInTheDocument();
    // 无 users.access / reviews.access → 这些分组整组不渲染。
    expect(screen.queryByText("用户管理")).toBeNull();
    expect(screen.queryByText("审核管理")).toBeNull();
    expect(screen.queryByText("天生币管理")).toBeNull();
  });

  it.each([
    { role: "admin" as const, permissions: [], canManage: false },
    {
      role: "admin" as const,
      permissions: ["coins.access"],
      canManage: true
    },
    { role: "super_admin" as const, permissions: [], canManage: true }
  ])(
    "$role permissions=$permissions：我的天生币独立于管理权限可见且可访问",
    async ({ role, permissions, canManage }) => {
      setLevel(role, permissions);
      renderAt("/account/coins");
      fireEvent.click(screen.getByText("天生币"));
      const entry = screen.getByRole("menuitem", { name: "我的天生币" });
      expect(entry).toHaveClass("ant-menu-item-selected");
      fireEvent.click(entry);
      expect(mockNavigate).toHaveBeenCalledWith("/account/coins");
      expect(
        screen.queryByRole("menuitem", { name: "天生币管理" }) !== null
      ).toBe(canManage);
      const { canVisitAdminRoute } = await import("@/lib/adminPageRoutes");
      const profile = useAuthStore.getState().profile;
      expect(canVisitAdminRoute(profile, "/account/coins")).toBe(true);
      expect(canVisitAdminRoute(profile, "/coins")).toBe(canManage);
    }
  );

  it.each([
    ["words.access"],
    ["sentences.access"],
    ["speech.global_dubbing"]
  ] as [string][])(
    "配音中心是可直接点击的一级菜单，目录权限为 %s",
    async (permission) => {
      setLevel("admin", [permission]);
      renderAt("/voices");
      const entry = screen.getByRole("menuitem", { name: /配音中心/ });
      expect(entry).toHaveClass("ant-menu-item-selected");
      fireEvent.click(entry);
      expect(mockNavigate).toHaveBeenCalledWith("/voices");
      const { canVisitAdminRoute } = await import("@/lib/adminPageRoutes");
      expect(
        canVisitAdminRoute(useAuthStore.getState().profile, "/voices")
      ).toBe(true);
    }
  );

  it("没有目录权限时不展示配音中心，直链也不放行", async () => {
    setLevel("admin", ["speech.generate"]);
    renderAt("/");
    expect(screen.queryByText("配音中心")).toBeNull();
    const { canVisitAdminRoute } = await import("@/lib/adminPageRoutes");
    expect(canVisitAdminRoute(useAuthStore.getState().profile, "/voices")).toBe(
      false
    );
  });

  it("super_admin 即便 permissions 为空也可见全部委派菜单", () => {
    setLevel("super_admin", []);
    renderAt("/");
    // 超管隐式全权：委派菜单组照常出，管理员管理叶子按 level 显示。
    expect(screen.getByText("词库管理")).toBeInTheDocument();
    expect(screen.getByText("审核管理")).toBeInTheDocument();
    fireEvent.click(screen.getByText("用户管理"));
    expect(screen.getByText("管理员管理")).toBeInTheDocument();
  });

  it("super_admin：用户管理分组下显示「管理员管理」并跳转 /admins", () => {
    setLevel("super_admin");
    renderAt("/");
    fireEvent.click(screen.getByText("用户管理"));
    const entry = screen.getByText("管理员管理");
    expect(entry).toBeInTheDocument();
    fireEvent.click(entry);
    expect(mockNavigate).toHaveBeenCalledWith("/admins");
  });

  it("super_admin：权限管理真实入口跳转，不沿用角色占位", () => {
    setLevel("super_admin");
    renderAt("/");
    fireEvent.click(screen.getByText("用户管理"));
    fireEvent.click(screen.getByText("权限管理"));
    expect(mockNavigate).toHaveBeenCalledWith("/permissions");
  });

  it("普通 admin：用户管理分组下无「权限管理」入口", () => {
    // 给普通 admin users.access 以便展开用户管理分组，验证 superOnly 叶子仍不渲染。
    setLevel("admin", ["users.access"]);
    renderAt("/");
    fireEvent.click(screen.getByText("用户管理"));
    expect(screen.queryByText("权限管理")).toBeNull();
    expect(screen.queryByText("管理员管理")).toBeNull();
  });

  it("词性配置仅超级管理员可见并导航到系统设置路由", () => {
    setLevel("admin", ["words.access"]);
    const ordinary = renderAt("/");
    expect(screen.queryByText("系统设置")).toBeNull();
    ordinary.unmount();

    setLevel("super_admin", []);
    renderAt("/");
    fireEvent.click(screen.getByText("系统设置"));
    const entry = screen.getByText("词性配置");
    fireEvent.click(entry);
    expect(mockNavigate).toHaveBeenCalledWith("/settings/parts-of-speech");
  });

  it("分类分组默认收起，展开后已落地模块可点", () => {
    renderAt("/words");
    // 分类默认收起：子项初始不在可访问树中。
    expect(screen.queryByRole("menuitem", { name: "智能词库" })).toBeNull();

    // 展开「词库管理」分组后，智能词库（已挂真实路由）可点。
    fireEvent.click(screen.getByText("词库管理"));
    expect(
      screen.getByRole("menuitem", { name: "智能词库" })
    ).toBeInTheDocument();
  });

  it("点击已落地模块跳转其路由并回调 onNavigate", () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ConsoleSidebar onNavigate={onNavigate} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("词库管理"));
    fireEvent.click(screen.getByRole("menuitem", { name: "智能词库" }));
    expect(mockNavigate).toHaveBeenCalledWith("/words");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("未传 onNavigate 时点击已落地模块仍安全跳转", () => {
    // onNavigate 缺省：进入跳转分支后 onNavigate?.() 应短路不抛错。
    renderAt("/");
    fireEvent.click(screen.getByText("词库管理"));
    fireEvent.click(screen.getByRole("menuitem", { name: "垃圾桶" }));
    expect(mockNavigate).toHaveBeenCalledWith("/words/trash");
  });

  it("收起态隐藏站名、仅保留图标", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ConsoleSidebar collapsed />
      </MemoryRouter>
    );
    expect(screen.queryByText("天生会背")).toBeNull();
  });
});

it("公开例句只读管理员可见例句菜单及直链，不能进入词库", async () => {
  setLevel("admin", ["sentences.read_published"]);
  renderAt("/sentences");
  fireEvent.click(screen.getByText("词库管理"));
  await waitFor(() => expect(screen.getByText("多维例句")).toBeVisible());
  expect(screen.queryByText("智能词库")).toBeNull();
  const { canVisitAdminRoute } = await import("@/lib/adminPageRoutes");
  const profile = useAuthStore.getState().profile;
  expect(canVisitAdminRoute(profile, "/sentences")).toBe(true);
  expect(canVisitAdminRoute(profile, "/words")).toBe(false);
  expect(
    canVisitAdminRoute({ ...profile!, permissions: [] }, "/sentences")
  ).toBe(false);
});

it("词表查看权限可进入审核菜单及直链，审核操作权限不替代查看权限", async () => {
  const { canVisitAdminRoute } = await import("@/lib/adminPageRoutes");
  setLevel("admin", ["wordlists.access"]);
  const view = renderAt("/");
  fireEvent.click(screen.getByText("审核管理"));
  fireEvent.click(screen.getByText("词表审核"));
  expect(mockNavigate).toHaveBeenCalledWith("/reviews");
  expect(canVisitAdminRoute(useAuthStore.getState().profile, "/reviews")).toBe(
    true
  );
  view.unmount();
  setLevel("admin", ["wordlists.review"]);
  renderAt("/");
  expect(screen.queryByText("审核管理")).toBeNull();
  expect(canVisitAdminRoute(useAuthStore.getState().profile, "/reviews")).toBe(
    false
  );
});

it.each([
  ["/words/trash", "垃圾桶"],
  ["/words", "智能词库"],
  ["/words/entry-id/v3/wizard/forms", "智能词库"]
])("%s 只选中所属的菜单项 %s", (path, selected) => {
  renderAt(path);
  fireEvent.click(screen.getByText("词库管理"));
  const library = screen.getByRole("menuitem", { name: "智能词库" });
  const trash = screen.getByRole("menuitem", { name: "垃圾桶" });
  expect(library.classList.contains("ant-menu-item-selected")).toBe(
    selected === "智能词库"
  );
  expect(trash.classList.contains("ant-menu-item-selected")).toBe(
    selected === "垃圾桶"
  );
});

it("收起侧栏的浮层菜单中，垃圾桶也不会同时选中智能词库", async () => {
  render(
    <MemoryRouter initialEntries={["/words/trash"]}>
      <ConsoleSidebar collapsed />
    </MemoryRouter>
  );
  fireEvent.mouseOver(screen.getByText("词库管理"));
  expect(await screen.findByRole("menuitem", { name: "垃圾桶" })).toHaveClass(
    "ant-menu-item-selected"
  );
  expect(screen.getByRole("menuitem", { name: "智能词库" })).not.toHaveClass(
    "ant-menu-item-selected"
  );
});
