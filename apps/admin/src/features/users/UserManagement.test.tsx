import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserListQuery, AdminUserView } from "@tsz/types";

// 登录管理员的 level：super_admin 时编辑/启禁用可用，admin 时置灰（gating 用例覆盖）。
// 变量以 mock 前缀命名，满足 vitest vi.mock 工厂对外部引用的约束。
let mockAdminLevel: "super_admin" | "admin" = "super_admin";

vi.mock("@/lib/auth", () => ({
  api: {
    users: {
      list: vi.fn(),
      get: vi.fn(),
      setStatus: vi.fn(),
      update: vi.fn()
    }
  },
  // UserManagement 经共享 useIsSuperAdmin 决定写操作是否置灰；直接按 mockAdminLevel 返回布尔。
  useIsSuperAdmin: () => mockAdminLevel === "super_admin"
}));

import { api } from "@/lib/auth";
import { UserManagement } from "./UserManagement";

// 集成用例含 antd 表格/弹窗 + 异步 mutation + message 门户，覆盖率插桩下于全量并行
// 运行时偏慢，放宽超时抗资源竞争（与 AdminManagement.test 同理）。
vi.setConfig({ testTimeout: 15000 });

const mockList = vi.mocked(api.users.list);
const mockSetStatus = vi.mocked(api.users.setStatus);
const mockUpdate = vi.mocked(api.users.update);

interface Spec {
  id: string;
  name: string;
  role: "student" | "teacher";
  status?: "active" | "disabled";
  phone?: string;
  email?: string;
}

// 13 人（12 学生 + 1 老师）：够翻到第 2 页；melody 位于第 11 位（第 2 页首行）。
const SPEC: Spec[] = [
  {
    id: "1",
    name: "record",
    role: "student",
    phone: "13800000001",
    email: "record@qq.com"
  },
  { id: "2", name: "workout", role: "teacher", phone: "13800000002" },
  { id: "3", name: "attitude", role: "student", email: "attitude@qq.com" }, // 无手机
  { id: "4", name: "aged", role: "student", status: "disabled" },
  { id: "5", name: "circuit", role: "student" },
  { id: "6", name: "chewing", role: "student" },
  { id: "7", name: "transparent", role: "student" },
  { id: "8", name: "screen", role: "student" },
  { id: "9", name: "harbor", role: "student" },
  { id: "10", name: "gravity", role: "student" },
  { id: "11", name: "melody", role: "student" },
  { id: "12", name: "novel", role: "student" },
  { id: "13", name: "pioneer", role: "student" }
];

// 契约外字段（level/coin_balance）后端不返回，本地态里恒为缺省 → 列表显示「-」。
function seed(): AdminUserView[] {
  const rows: AdminUserView[] = SPEC.map((s) => ({
    id: s.id,
    phone: s.phone,
    email: s.email,
    display_name: s.name,
    avatar_url: "",
    roles: [s.role],
    status: s.status ?? "active",
    created_at: "2026-06-01T08:00:00Z",
    updated_at: "2026-06-02T08:00:00Z"
  }));
  // 首行（record，第 1 页可见）刻意带 level、且更新时间为空：覆盖表格「等级」列的
  // 有值分支与「更新时间」列的占位分支——真实后端虽不下发 level，列渲染仍须两分支都对。
  rows[0]!.level = "B2";
  rows[0]!.updated_at = "";
  return rows;
}

// 进程内可变态：写操作就地改，配合 React Query 失效重取生效（每例前 seed 复位）。
let users: AdminUserView[];

/** 模拟后端 GET /admin/users：role/q 过滤 + 分页，形状同 AdminUserListResponse。 */
function fakeList(query: AdminUserListQuery = {}) {
  let items = users;
  if (query.role) items = items.filter((u) => u.roles.includes(query.role!));
  if (query.q) {
    const q = query.q.toLowerCase();
    items = items.filter(
      (u) =>
        (u.phone ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q)
    );
  }
  const total = items.length;
  const page = query.page ?? 1;
  const size = query.page_size ?? 10;
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: { page, page_size: size, total }
  };
}

beforeEach(() => {
  mockAdminLevel = "super_admin";
  users = seed();
  mockList.mockImplementation(async (q) => fakeList(q));
  mockUpdate.mockImplementation(async (id, input) => {
    const u = users.find((x) => x.id === id)!;
    u.display_name = input.display_name;
    return u;
  });
  mockSetStatus.mockImplementation(async (id, status) => {
    const u = users.find((x) => x.id === id)!;
    u.status = status;
    return u;
  });
});

function renderPage() {
  // 关掉 query 重试：错误路径要能立刻看到失败态，而非等重试。
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AntApp>
          <UserManagement />
        </AntApp>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/** 整表内按可见文案点第 idx 个匹配按钮（避免 getByRole 扫全表，CLAUDE.md 超时陷阱）。 */
function clickRowButton(label: RegExp, idx = 0) {
  fireEvent.click(screen.getAllByText(label)[idx]!);
}

describe("UserManagement", () => {
  it("渲染搜索行、角色 tab 与用户行；等级/余额缺省列显示「-」", async () => {
    renderPage();
    expect(await screen.findByText("record")).toBeInTheDocument();
    for (const tab of ["全部", "老师", "学生"]) {
      expect(screen.getByRole("radio", { name: tab })).toBeInTheDocument();
    }
    // 等级 / 天生币余额 后端未填充 → 整列占位「-」。
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    // 首行带 level：「等级」列的有值分支渲染成 Tag「B2等级」。
    expect(screen.getByText("B2等级")).toBeInTheDocument();
  });

  it("切换到「老师」tab 只留老师行", async () => {
    renderPage();
    await screen.findByText("record");
    fireEvent.click(screen.getByRole("radio", { name: "老师" }));
    await waitFor(() => {
      expect(screen.getByText("workout")).toBeInTheDocument();
      expect(screen.queryByText("record")).toBeNull();
    });
  });

  it("按昵称搜索过滤列表", async () => {
    renderPage();
    await screen.findByText("record");
    fireEvent.change(screen.getByPlaceholderText("请输入用户昵称"), {
      target: { value: "screen" }
    });
    fireEvent.click(screen.getByText(/搜\s?索/));
    await waitFor(() => {
      expect(screen.getByText("screen")).toBeInTheDocument();
      expect(screen.queryByText("record")).toBeNull();
    });
  });

  it("重置按钮清空筛选恢复全部", async () => {
    renderPage();
    await screen.findByText("record");
    fireEvent.change(screen.getByPlaceholderText("请输入用户昵称"), {
      target: { value: "screen" }
    });
    fireEvent.click(screen.getByText(/搜\s?索/));
    await waitFor(() => expect(screen.queryByText("record")).toBeNull());
    fireEvent.click(screen.getByText(/重\s?置/));
    await waitFor(() => expect(screen.getByText("record")).toBeInTheDocument());
  });

  it("点昵称打开只读详情抽屉，缺失字段显示占位", async () => {
    renderPage();
    // attitude 无绑定手机：抽屉里「绑定电话」及 等级/余额 均为占位「-」。
    fireEvent.click(await screen.findByText("attitude"));
    // 「用户 ID」（带空格）是抽屉 Descriptions 独有标签，据此确证抽屉打开。
    expect(await screen.findByText("用户 ID")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("关闭详情抽屉", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("record"));
    expect(await screen.findByText("用户 ID")).toBeInTheDocument();
    // antd Drawer 关闭按钮 aria-label="Close"；点击触发 onClose → 抽屉隐藏。
    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByText("用户 ID")).toBeNull());
  });

  it("切 tab / 搜索 下发正确的 role / q wire 参数", async () => {
    renderPage();
    await screen.findByText("record");
    fireEvent.click(screen.getByRole("radio", { name: "老师" }));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ role: "teacher" })
      )
    );
    fireEvent.change(screen.getByPlaceholderText("请输入用户昵称"), {
      target: { value: "screen" }
    });
    fireEvent.click(screen.getByText(/搜\s?索/));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "screen" })
      )
    );
  });

  it("编辑保存改昵称，列表刷新", async () => {
    renderPage();
    await screen.findByText("record");
    clickRowButton(/编\s?辑/);
    const input = await screen.findByDisplayValue("record");
    fireEvent.change(input, { target: { value: "记录" } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("已保存")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("记录")).toBeInTheDocument());
    expect(mockUpdate).toHaveBeenCalledWith("1", { display_name: "记录" });
  });

  it("编辑保存失败给出错误提示且不关闭弹窗", async () => {
    renderPage();
    await screen.findByText("record");
    mockUpdate.mockRejectedValueOnce(new Error("保存炸了"));
    clickRowButton(/编\s?辑/);
    const input = await screen.findByDisplayValue("record");
    fireEvent.change(input, { target: { value: "记录" } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("保存炸了")).toBeInTheDocument();
    expect(screen.getByDisplayValue("记录")).toBeInTheDocument();
  });

  it("禁用一个正常用户给出提示", async () => {
    renderPage();
    await screen.findByText("record"); // record（i=0）active → 操作列显示「禁用」
    clickRowButton(/禁\s?用/);
    expect(await screen.findByText("已禁用")).toBeInTheDocument();
    expect(mockSetStatus).toHaveBeenCalledWith("1", "disabled");
  });

  it("启用一个被禁用用户给出提示", async () => {
    renderPage();
    await screen.findByText("aged"); // aged（disabled）→ 操作列显示「启用」
    clickRowButton(/启\s?用/);
    expect(await screen.findByText("已启用")).toBeInTheDocument();
    expect(mockSetStatus).toHaveBeenCalledWith("4", "active");
  });

  it("启禁用失败给出错误提示", async () => {
    renderPage();
    await screen.findByText("record");
    mockSetStatus.mockRejectedValueOnce(new Error("操作炸了"));
    clickRowButton(/禁\s?用/);
    expect(await screen.findByText("操作炸了")).toBeInTheDocument();
  });

  it("启禁用抛非 Error 时回退到「操作失败」文案", async () => {
    renderPage();
    await screen.findByText("record");
    mockSetStatus.mockRejectedValueOnce("weird");
    clickRowButton(/禁\s?用/);
    expect(await screen.findByText("操作失败")).toBeInTheDocument();
  });

  it("非超管时编辑/启禁用置灰", async () => {
    mockAdminLevel = "admin";
    renderPage();
    await screen.findByText("record");
    expect(screen.getAllByText(/编\s?辑/)[0]!.closest("button")).toBeDisabled();
    expect(screen.getAllByText(/禁\s?用/)[0]!.closest("button")).toBeDisabled();
  });

  it("删除按钮为占位、始终置灰（后端本轮无删除接口）", async () => {
    renderPage();
    await screen.findByText("record");
    expect(screen.getAllByText(/删\s?除/)[0]!.closest("button")).toBeDisabled();
  });

  it("天生币/等级/方言管理点击提示功能待接入", async () => {
    renderPage();
    await screen.findByText("record");
    clickRowButton(/^天生币管理$/);
    expect(
      await screen.findByText("天生币管理功能待接入，接口开发中")
    ).toBeInTheDocument();
    clickRowButton(/^等级管理$/);
    expect(
      await screen.findByText("等级管理功能待接入，接口开发中")
    ).toBeInTheDocument();
    clickRowButton(/^方言管理$/);
    expect(
      await screen.findByText("方言管理功能待接入，接口开发中")
    ).toBeInTheDocument();
  });

  it("翻到第 2 页展示剩余用户", async () => {
    renderPage();
    await screen.findByText("record"); // 第 1 页
    fireEvent.click(screen.getByTitle("2"));
    await waitFor(() => expect(screen.getByText("melody")).toBeInTheDocument());
  });

  it("列表加载失败展示错误 Alert，重试后恢复", async () => {
    mockList.mockRejectedValueOnce(new Error("用户炸了"));
    renderPage();
    expect(await screen.findByText("用户列表加载失败")).toBeInTheDocument();
    expect(screen.getByText("用户炸了")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/重\s?试/));
    await waitFor(() => expect(screen.getByText("record")).toBeInTheDocument());
  });
});
