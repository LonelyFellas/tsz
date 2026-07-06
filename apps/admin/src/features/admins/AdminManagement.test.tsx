import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { Admin } from "@tsz/types";

vi.mock("@/lib/auth", () => ({
  api: {
    admins: {
      list: vi.fn(),
      create: vi.fn(),
      setStatus: vi.fn(),
      resetPassword: vi.fn()
    }
  }
}));

import { api } from "@/lib/auth";
import { AdminManagement } from "./AdminManagement";

// 集成用例含 antd 表格/弹窗 + 异步 mutation + message 门户，覆盖率插桩下于全量并行
// 运行时偏慢，放宽超时抗资源竞争（与 UserManagement.test 同理）。
vi.setConfig({ testTimeout: 15000 });

const mockList = vi.mocked(api.admins.list);
const mockSetStatus = vi.mocked(api.admins.setStatus);
const mockReset = vi.mocked(api.admins.resetPassword);

const plainAdmin: Admin = {
  id: "a1",
  phone: "13800138000",
  display_name: "审核员小王",
  level: "admin",
  status: "active",
  created_at: "2026-07-01T00:00:00Z"
};
const superAdmin: Admin = {
  id: "a2",
  phone: "15257294120",
  // 昵称刻意区别于「超级管理员」这个 level 文案，避免 getByText 撞车。
  display_name: "总管阿强",
  level: "super_admin",
  status: "active",
  created_at: "2026-06-01T00:00:00Z"
};

function listResponse(items: Admin[]) {
  return { items, page: { page: 1, page_size: 10, total: items.length } };
}

function renderPage() {
  // 关掉 query 重试：错误路径测试要能立刻看到失败态，而非等 3 次重试。
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <AdminManagement />
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(listResponse([plainAdmin, superAdmin]));
});

describe("AdminManagement", () => {
  it("渲染管理员列表", async () => {
    renderPage();
    expect(await screen.findByText("审核员小王")).toBeInTheDocument();
    expect(screen.getByText("总管阿强")).toBeInTheDocument();
    // 权限等级 Tag。
    expect(screen.getByText("超级管理员")).toBeInTheDocument();
    expect(screen.getAllByText("普通管理员").length).toBeGreaterThan(0);
  });

  it("禁用成功给出提示", async () => {
    mockSetStatus.mockResolvedValue({ ...plainAdmin, status: "disabled" });
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.click(screen.getAllByRole("button", { name: /禁\s?用/ })[0]!);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a1", "disabled")
    );
    expect(await screen.findByText("已禁用")).toBeInTheDocument();
  });

  it("禁用最后一个超管返回 409：展示中文错误提示", async () => {
    mockSetStatus.mockRejectedValue(
      new HttpError(409, "cannot disable the last super admin")
    );
    renderPage();
    await screen.findByText("总管阿强");
    // 超管行也是 active，取第二个禁用按钮。
    fireEvent.click(screen.getAllByRole("button", { name: /禁\s?用/ })[1]!);
    // 断言点中的确是超管行（a2），而非任意行——否则错误映射就名不副实。
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a2", "disabled")
    );
    // 409 被映射为中文，而非透传后端英文原文。
    expect(
      await screen.findByText("不能禁用最后一个超级管理员")
    ).toBeInTheDocument();
  });

  it("启用被禁用的管理员", async () => {
    const disabled: Admin = { ...plainAdmin, status: "disabled" };
    mockList.mockResolvedValue(listResponse([disabled]));
    mockSetStatus.mockResolvedValue({ ...disabled, status: "active" });
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.click(screen.getByRole("button", { name: /启\s?用/ }));
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a1", "active")
    );
    expect(await screen.findByText("已启用")).toBeInTheDocument();
  });

  it("重置普通管理员密码：弹窗展示一次性临时密码", async () => {
    mockReset.mockResolvedValue({ temporary_password: "Kd7mNpQ2rXt9" });
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.click(screen.getAllByRole("button", { name: "重置密码" })[0]!);
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith("a1"));
    expect(await screen.findByText("Kd7mNpQ2rXt9")).toBeInTheDocument();
    expect(screen.getByText("临时密码已生成")).toBeInTheDocument();
  });

  it("重置密码失败给出错误提示", async () => {
    mockReset.mockRejectedValue(new Error("cannot reset a super admin"));
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.click(screen.getAllByRole("button", { name: "重置密码" })[0]!);
    expect(
      await screen.findByText("cannot reset a super admin")
    ).toBeInTheDocument();
  });

  it("超管行的重置密码按钮禁用", async () => {
    renderPage();
    await screen.findByText("总管阿强");
    // 第二行（超管）的重置密码按钮 disabled。
    expect(
      screen.getAllByRole("button", { name: "重置密码" })[1]
    ).toBeDisabled();
  });

  it("点新建管理员打开建号弹窗", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.click(screen.getByRole("button", { name: /新建管理员/ }));
    expect(
      await screen.findByPlaceholderText("登录用手机号")
    ).toBeInTheDocument();
  });

  it("按关键字搜索：以 q 请求列表", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.change(screen.getByPlaceholderText("手机 / 邮箱 / 昵称"), {
      target: { value: "小王" }
    });
    fireEvent.click(screen.getByRole("button", { name: /搜\s?索/ }));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "小王", page: 1 })
      )
    );
  });

  it("列表加载失败展示错误 Alert 与重试", async () => {
    mockList.mockRejectedValueOnce(new Error("加载炸了"));
    renderPage();
    expect(await screen.findByText("管理员列表加载失败")).toBeInTheDocument();
    expect(screen.getByText("加载炸了")).toBeInTheDocument();
  });
});
