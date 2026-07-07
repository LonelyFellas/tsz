import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { AdminRole, PermissionCatalogItem } from "@tsz/types";

vi.mock("@/lib/auth", () => ({
  api: {
    roles: {
      permissions: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn()
    },
    admins: {
      list: vi.fn(),
      setRole: vi.fn()
    }
  }
}));

import { api } from "@/lib/auth";
import { RoleManagement } from "./RoleManagement";

// 集成用例含 antd 表格/弹窗/下拉 + 异步 mutation + message 门户，覆盖率插桩下偏慢，放宽超时。
vi.setConfig({ testTimeout: 15000 });

const mockPermissions = vi.mocked(api.roles.permissions);
const mockList = vi.mocked(api.roles.list);
const mockCreate = vi.mocked(api.roles.create);
const mockUpdate = vi.mocked(api.roles.update);
const mockRemove = vi.mocked(api.roles.remove);
const mockAdminList = vi.mocked(api.admins.list);
const mockSetRole = vi.mocked(api.admins.setRole);

// §8 目录（顺序即侧栏顺序）。
const CATALOG: PermissionCatalogItem[] = [
  { key: "users.access", label: "用户管理" },
  { key: "classes.access", label: "班级管理" },
  { key: "words.access", label: "智能词库" },
  { key: "customdict.access", label: "自定义词库" },
  { key: "sentences.access", label: "多维例句" },
  { key: "wordlists.access", label: "智能词表" },
  { key: "customwordlist.access", label: "自定义词表" },
  { key: "tasks.access", label: "任务管理" },
  { key: "reviews.access", label: "词表审核" },
  { key: "teacherapply.access", label: "教师申请审核" },
  { key: "comments.access", label: "评论审核" },
  { key: "coins.access", label: "天生币管理" }
];

const systemRole: AdminRole = {
  id: "r-system",
  name: "全功能管理员",
  description: "系统预置",
  is_system: true,
  permissions: CATALOG.map((c) => c.key),
  member_count: 5,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z"
};
const libRole: AdminRole = {
  id: "r-lib",
  name: "词库管理员",
  description: "管理智能词库与词表",
  is_system: false,
  // 后端按 key 字母序返回：'wordlists' < 'words'。
  permissions: ["wordlists.access", "words.access"],
  member_count: 3,
  created_at: "2026-06-02T00:00:00Z",
  updated_at: "2026-07-01T09:00:00Z"
};
const emptyRole: AdminRole = {
  id: "r-empty",
  name: "新人",
  description: "",
  is_system: false,
  permissions: [],
  member_count: 0,
  created_at: "2026-06-03T00:00:00Z",
  updated_at: "2026-07-02T09:00:00Z"
};
const manyRole: AdminRole = {
  id: "r-many",
  name: "全组长",
  description: "跨组",
  is_system: false,
  permissions: [
    "classes.access",
    "customdict.access",
    "reviews.access",
    "sentences.access",
    "users.access",
    "wordlists.access",
    "words.access"
  ],
  member_count: 1,
  created_at: "2026-06-04T00:00:00Z",
  updated_at: "2026-07-03T09:00:00Z"
};

const plainAdmin = {
  id: "a-plain",
  phone: "13800138000",
  display_name: "审核员小王",
  level: "admin" as const,
  status: "active" as const,
  created_at: "2026-07-01T00:00:00Z"
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <RoleManagement />
      </AntApp>
    </QueryClientProvider>
  );
}

/**
 * 打开某个 antd Select（点其根节点），在浮层里点选文案匹配的选项。
 * 按 `.ant-select-item-option` 定位而非按浮层可见性——v6 里刚关闭的浮层未必立刻加隐藏类，
 * 但各 Select 的选项文案互不相同（管理员名 vs 角色名 vs 收回），据文案定位即可精确命中。
 */
async function pickOption(selectRoot: Element, text: string) {
  fireEvent.mouseDown(selectRoot);
  const opt = await waitFor(() => {
    const el = [...document.querySelectorAll(".ant-select-item-option")].find(
      (i) => (i.textContent ?? "").includes(text)
    );
    if (!el) throw new Error(`option not ready: ${text}`);
    return el;
  });
  fireEvent.click(opt);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPermissions.mockResolvedValue({ items: CATALOG });
  mockList.mockResolvedValue({
    items: [systemRole, libRole, emptyRole, manyRole]
  });
  mockAdminList.mockResolvedValue({
    items: [plainAdmin],
    page: { page: 1, page_size: 100, total: 1 }
  });
});

describe("RoleManagement — 列表渲染", () => {
  it("渲染角色行、系统标记、权限标签与折叠", async () => {
    renderPage();
    expect(await screen.findByText("全功能管理员")).toBeInTheDocument();
    // 系统角色：「系统」标记 + 「全部功能」。
    expect(screen.getByText("系统")).toBeInTheDocument();
    expect(screen.getByText("全部功能")).toBeInTheDocument();
    // 词库管理员：权限按侧栏顺序渲染为标签（智能词库 / 智能词表）。
    expect(screen.getAllByText("智能词库").length).toBeGreaterThan(0);
    expect(screen.getAllByText("智能词表").length).toBeGreaterThan(0);
    // 空权限角色：仅首页。
    expect(screen.getByText("仅首页")).toBeInTheDocument();
    // 7 项权限的角色：前 6 个标签 + 折叠「+1」。
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("系统角色的编辑 / 删除按钮置灰", async () => {
    renderPage();
    await screen.findByText("全功能管理员");
    // 第 0 行是系统角色（列表系统角色最前）。
    expect(screen.getAllByText("编辑")[0]!.closest("button")).toBeDisabled();
    expect(screen.getAllByText("删除")[0]!.closest("button")).toBeDisabled();
    // 自定义角色（第 1 行）可编辑。
    expect(
      screen.getAllByText("编辑")[1]!.closest("button")
    ).not.toBeDisabled();
  });

  it("点「刷新」重拉角色列表", async () => {
    renderPage();
    await screen.findByText("全功能管理员");
    expect(mockList).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /刷新/ }));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it("列表加载失败展示错误 Alert 与重试", async () => {
    mockList.mockReset();
    mockList
      .mockRejectedValueOnce(new Error("加载炸了"))
      .mockResolvedValue({ items: [systemRole] });
    renderPage();
    expect(await screen.findByText("角色列表加载失败")).toBeInTheDocument();
    expect(screen.getByText("加载炸了")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/重\s?试/));
    expect(await screen.findByText("全功能管理员")).toBeInTheDocument();
  });
});

describe("RoleManagement — 建角色", () => {
  it("建角色成功：提交名称 + 描述空串 + 勾中权限全量数组", async () => {
    mockCreate.mockResolvedValue({ ...libRole, id: "r-new", name: "审核专员" });
    renderPage();
    await screen.findByText("全功能管理员");
    fireEvent.click(screen.getByRole("button", { name: /新建角色/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("如：词库管理员"), {
      target: { value: "审核专员" }
    });
    // 勾选「词表审核」（reviews.access，已落地）。
    fireEvent.click(within(dialog).getByText("词表审核"));
    fireEvent.click(within(dialog).getByText(/^创\s?建$/));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: "审核专员",
        description: "",
        permissions: ["reviews.access"]
      })
    );
    expect(await screen.findByText("角色已创建")).toBeInTheDocument();
  });

  it("重名 409：高亮名称输入框，弹窗不关", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(409, "role name already exists")
    );
    renderPage();
    await screen.findByText("全功能管理员");
    fireEvent.click(screen.getByRole("button", { name: /新建角色/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("如：词库管理员"), {
      target: { value: "词库管理员" }
    });
    fireEvent.click(within(dialog).getByText(/^创\s?建$/));
    expect(await within(dialog).findByText("角色名已存在")).toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalled();
  });

  it("unknown_permission_key 400：提示并重拉权限目录", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(
        400,
        '"nope.access": unknown permission key',
        [],
        "unknown_permission_key"
      )
    );
    renderPage();
    await screen.findByText("全功能管理员");
    // 初始目录已拉一次。
    await waitFor(() => expect(mockPermissions).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /新建角色/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("如：词库管理员"), {
      target: { value: "新角色" }
    });
    fireEvent.click(within(dialog).getByText(/^创\s?建$/));
    expect(
      await screen.findByText("有权限项已失效，请刷新权限目录后重试")
    ).toBeInTheDocument();
    // 触发目录重拉。
    await waitFor(() => expect(mockPermissions).toHaveBeenCalledTimes(2));
  });

  it("其余 400：展示后端 error 原文，弹窗不关", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(
        400,
        "role name cannot be blank or contain < > or invisible characters"
      )
    );
    renderPage();
    await screen.findByText("全功能管理员");
    fireEvent.click(screen.getByRole("button", { name: /新建角色/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("如：词库管理员"), {
      target: { value: "新角色" }
    });
    fireEvent.click(within(dialog).getByText(/^创\s?建$/));
    expect(
      await screen.findByText(
        "role name cannot be blank or contain < > or invisible characters"
      )
    ).toBeInTheDocument();
  });

  it("权限目录加载失败：弹窗内展示错误态，点重试可恢复", async () => {
    mockPermissions.mockReset();
    mockPermissions
      .mockRejectedValueOnce(new Error("目录炸了"))
      .mockResolvedValue({ items: CATALOG });
    renderPage();
    await screen.findByText("全功能管理员");
    fireEvent.click(screen.getByRole("button", { name: /新建角色/ }));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("权限目录加载失败")
    ).toBeInTheDocument();
    // 点弹窗内「重试」重拉目录 → 勾选框渲染出来。
    fireEvent.click(within(dialog).getByText(/重\s?试/));
    expect(await within(dialog).findByText("词表审核")).toBeInTheDocument();
  });
});

describe("RoleManagement — 改角色", () => {
  it("编辑成功：预填名称，权限集全量替换提交", async () => {
    mockUpdate.mockResolvedValue({ ...libRole, name: "词库管理员Plus" });
    renderPage();
    await screen.findByText("全功能管理员");
    // 第 1 行为词库管理员。
    fireEvent.click(screen.getAllByText("编辑")[1]!);
    const dialog = await screen.findByRole("dialog");
    const nameInput = within(dialog).getByPlaceholderText(
      "如：词库管理员"
    ) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("词库管理员"));
    fireEvent.change(nameInput, { target: { value: "词库管理员Plus" } });
    fireEvent.click(within(dialog).getByText(/^保\s?存$/));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("r-lib", {
        name: "词库管理员Plus",
        description: "管理智能词库与词表",
        permissions: ["wordlists.access", "words.access"]
      })
    );
    expect(await screen.findByText("已保存")).toBeInTheDocument();
  });

  it("编辑遇 404（并发删）：提示并关弹窗、刷新列表", async () => {
    mockUpdate.mockRejectedValue(new HttpError(404, "role not found"));
    renderPage();
    await screen.findByText("全功能管理员");
    fireEvent.click(screen.getAllByText("编辑")[1]!);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(
        (
          within(dialog).getByPlaceholderText(
            "如：词库管理员"
          ) as HTMLInputElement
        ).value
      ).toBe("词库管理员")
    );
    fireEvent.click(within(dialog).getByText(/^保\s?存$/));
    expect(
      await screen.findByText("角色或管理员不存在，可能已被删除")
    ).toBeInTheDocument();
    // 列表重拉（初次 + 失效后一次）。
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});

describe("RoleManagement — 删角色", () => {
  it("删除：member_count 二次确认后删除", async () => {
    mockRemove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("全功能管理员");
    fireEvent.click(screen.getAllByText("删除")[1]!);
    // 确认弹窗含 member_count 文案。
    expect(
      await screen.findByText(/该角色下有 3 名管理员/)
    ).toBeInTheDocument();
    const confirmBtns = document.querySelector(".ant-modal-confirm-btns")!;
    fireEvent.click(within(confirmBtns as HTMLElement).getByText(/^删\s?除$/));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("r-lib"));
    expect(await screen.findByText("已删除")).toBeInTheDocument();
  });

  it("删除 0 成员角色：确认文案不提降级人数", async () => {
    mockRemove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("全功能管理员");
    // 第 2 行为「新人」(member_count 0)。
    fireEvent.click(screen.getAllByText("删除")[2]!);
    expect(await screen.findByText("确认删除该角色？")).toBeInTheDocument();
    const confirmBtns = document.querySelector(".ant-modal-confirm-btns")!;
    fireEvent.click(within(confirmBtns as HTMLElement).getByText(/^删\s?除$/));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("r-empty"));
  });

  it("删除 404：提示并刷新列表", async () => {
    mockRemove.mockRejectedValue(new HttpError(404, "role not found"));
    renderPage();
    await screen.findByText("全功能管理员");
    fireEvent.click(screen.getAllByText("删除")[1]!);
    await screen.findByText(/该角色下有 3 名管理员/);
    const confirmBtns = document.querySelector(".ant-modal-confirm-btns")!;
    fireEvent.click(within(confirmBtns as HTMLElement).getByText(/^删\s?除$/));
    expect(
      await screen.findByText("角色或管理员不存在，可能已被删除")
    ).toBeInTheDocument();
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});

describe("RoleManagement — 派角色", () => {
  // 打开指派弹窗，等管理员下拉渲染出来（占位文案）。
  async function openAssign() {
    fireEvent.click(screen.getByRole("button", { name: /指派角色/ }));
    await screen.findByText("选择一名普通管理员");
  }
  // 弹窗底部主按钮（指派）。避开工具栏「指派角色」的同名文案。
  function assignOk() {
    return document.querySelector(
      ".ant-modal-footer .ant-btn-primary"
    ) as HTMLElement;
  }

  it("指派：选管理员 + 角色 → setRole(adminId, roleId)", async () => {
    mockSetRole.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("全功能管理员");
    await openAssign();
    const selectors = document.querySelectorAll(".ant-select");
    await pickOption(selectors[0]!, "审核员小王（13800138000）");
    await pickOption(selectors[1]!, "词库管理员");
    fireEvent.click(assignOk());
    await waitFor(() =>
      expect(mockSetRole).toHaveBeenCalledWith("a-plain", "r-lib")
    );
    expect(await screen.findByText("已指派角色")).toBeInTheDocument();
  });

  it("收回：选管理员 + 收回角色 → setRole(adminId, null)", async () => {
    mockSetRole.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("全功能管理员");
    await openAssign();
    const selectors = document.querySelectorAll(".ant-select");
    await pickOption(selectors[0]!, "审核员小王（13800138000）");
    await pickOption(selectors[1]!, "收回角色（降为仅首页）");
    fireEvent.click(assignOk());
    await waitFor(() =>
      expect(mockSetRole).toHaveBeenCalledWith("a-plain", null)
    );
    expect(await screen.findByText("已收回角色")).toBeInTheDocument();
  });

  it("派角色失败（403 派超管兜底）：中文提示，弹窗保留", async () => {
    mockSetRole.mockRejectedValue(
      new HttpError(403, "cannot assign a role to a super admin")
    );
    renderPage();
    await screen.findByText("全功能管理员");
    await openAssign();
    const selectors = document.querySelectorAll(".ant-select");
    await pickOption(selectors[0]!, "审核员小王（13800138000）");
    await pickOption(selectors[1]!, "词库管理员");
    fireEvent.click(assignOk());
    expect(
      await screen.findByText("无权限执行此操作（系统角色或超管不可操作）")
    ).toBeInTheDocument();
  });
});
