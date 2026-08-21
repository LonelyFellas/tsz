import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { AdminUserListQuery, AdminUserView } from "@tsz/types";

// 编辑 / 启禁用按后台身份置灰：逐例可切超管与普通 admin 两种身份。
const auth = vi.hoisted(() => ({ isSuperAdmin: true }));

vi.mock("@/lib/auth", () => ({
  api: {
    users: {
      list: vi.fn(),
      get: vi.fn(),
      setStatus: vi.fn(),
      update: vi.fn()
    }
  },
  useIsSuperAdmin: () => auth.isSuperAdmin
}));

import { api } from "@/lib/auth";
import { UserManagement } from "./UserManagement";

// 集成用例含 antd 表格/抽屉 + message 门户，覆盖率插桩下于全量并行
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

// 每例复位的列表数据源。
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
    page: {
      page,
      page_size: size,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / size)
    }
  };
}

beforeEach(() => {
  auth.isSuperAdmin = true;
  users = seed();
  mockList.mockImplementation(async (q) => fakeList(q));
  // 写操作落回本地数据源：mutation 成功后列表失效重取，能看到状态/昵称真的变了。
  mockSetStatus.mockReset();
  mockSetStatus.mockImplementation(async (id, status) => {
    const row = users.find((u) => u.id === id)!;
    row.status = status;
    return row;
  });
  mockUpdate.mockReset();
  mockUpdate.mockImplementation(async (id, input) => {
    const row = users.find((u) => u.id === id)!;
    row.display_name = input.display_name;
    return row;
  });
});

/** 点确认弹窗里的主按钮（.ant-modal-confirm-btns 内，按可见文案定位）。 */
function clickConfirmOk(label: RegExp) {
  const btns = document.querySelector(".ant-modal-confirm-btns")!;
  fireEvent.click(within(btns as HTMLElement).getByText(label));
}

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
    fireEvent.change(screen.getByPlaceholderText("手机号 / 邮箱 / 用户昵称"), {
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
    fireEvent.change(screen.getByPlaceholderText("手机号 / 邮箱 / 用户昵称"), {
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
    fireEvent.change(screen.getByPlaceholderText("手机号 / 邮箱 / 用户昵称"), {
      target: { value: "screen" }
    });
    fireEvent.click(screen.getByText(/搜\s?索/));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "screen" })
      )
    );
  });

  it("非超级管理员：编辑与启禁用置灰（写操作后端限超管）", async () => {
    auth.isSuperAdmin = false;
    renderPage();
    await screen.findByText("record");
    expect(
      screen.getAllByText(/^编\s?辑$/)[0]!.closest("button")
    ).toBeDisabled();
    expect(
      screen.getAllByText(/^禁\s?用$/)[0]!.closest("button")
    ).toBeDisabled();
  });

  it("超级管理员：编辑与启禁用可点", async () => {
    renderPage();
    await screen.findByText("record");
    expect(
      screen.getAllByText(/^编\s?辑$/)[0]!.closest("button")
    ).not.toBeDisabled();
    expect(
      screen.getAllByText(/^禁\s?用$/)[0]!.closest("button")
    ).not.toBeDisabled();
  });

  it("点编辑打开弹窗，改昵称保存成功后列表刷新", async () => {
    renderPage();
    await screen.findByText("record");
    clickRowButton(/^编\s?辑$/);
    const input = await screen.findByDisplayValue("record");
    fireEvent.change(input, { target: { value: "记录员" } });
    fireEvent.click(screen.getByText(/^保\s?存$/));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("1", { display_name: "记录员" })
    );
    expect(await screen.findByText("记录员")).toBeInTheDocument();
  });

  it("禁用：二次确认后调用接口，行状态翻成启用", async () => {
    renderPage();
    await screen.findByText("record");
    clickRowButton(/^禁\s?用$/);
    // 文案不承诺「立即下线」：禁用有一个 access-token TTL 的延迟。
    expect(
      await screen.findByText(/最长在一个访问令牌有效期内失效/)
    ).toBeInTheDocument();
    clickConfirmOk(/^禁\s?用$/);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("1", "disabled")
    );
    // 列表失效重取后首行翻成禁用态，行操作按钮变「启用」（aged 那行本就是启用，故 2 个）。
    await waitFor(() =>
      expect(screen.getAllByText(/^启\s?用$/)).toHaveLength(2)
    );
  });

  it("启用：确认文案与按钮走启用分支", async () => {
    // aged（第 4 行）初始为 disabled，行操作按钮是「启用」。
    renderPage();
    await screen.findByText("aged");
    clickRowButton(/^启\s?用$/);
    expect(
      await screen.findByText("启用后该用户可以重新登录。确认启用？")
    ).toBeInTheDocument();
    clickConfirmOk(/^启\s?用$/);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("4", "active")
    );
    expect(await screen.findByText("已启用")).toBeInTheDocument();
  });

  it("启禁用 403：提示需超级管理员权限（后端是第二道防线）", async () => {
    mockSetStatus.mockRejectedValue(new HttpError(403, "super admin required"));
    renderPage();
    await screen.findByText("record");
    clickRowButton(/^禁\s?用$/);
    await screen.findByText(/最长在一个访问令牌有效期内失效/);
    clickConfirmOk(/^禁\s?用$/);
    expect(await screen.findByText("需超级管理员权限")).toBeInTheDocument();
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
