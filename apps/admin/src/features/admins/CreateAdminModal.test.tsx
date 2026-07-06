import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  api: { admins: { create: vi.fn() } }
}));

import { HttpError } from "@tsz/api-client";
import { api } from "@/lib/auth";
import { CreateAdminModal } from "./CreateAdminModal";

// 表单校验/提交为异步，覆盖率插桩下全量并行运行偏慢，放宽超时抗竞争。
vi.setConfig({ testTimeout: 15000 });

const mockCreate = vi.mocked(api.admins.create);

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AntApp>
        <CreateAdminModal open onClose={vi.fn()} />
      </AntApp>
    </QueryClientProvider>
  );
}

function fill(values: {
  phone?: string;
  password?: string;
  display_name?: string;
}) {
  if (values.phone !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("登录用手机号"), {
      target: { value: values.phone }
    });
  }
  if (values.password !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("至少 12 位，非纯数字"), {
      target: { value: values.password }
    });
  }
  if (values.display_name !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("管理员昵称"), {
      target: { value: values.display_name }
    });
  }
}

const CREATE = /^创\s?建$/;

beforeEach(() => vi.clearAllMocks());

describe("CreateAdminModal", () => {
  it("密码不足 12 位：校验拦截，不打后端", async () => {
    renderModal();
    fill({ phone: "13800138000", password: "short", display_name: "小王" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("密码至少 12 位")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("昵称含 < > 被拦截", async () => {
    renderModal();
    fill({
      phone: "13800138000",
      password: "str0ng-admin-pw!",
      display_name: "a<b"
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(
      await screen.findByText("昵称不能包含 < > 或控制字符")
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("纯数字密码被拦截", async () => {
    renderModal();
    fill({
      phone: "13800138000",
      password: "123456789012",
      display_name: "小王"
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("密码不能是纯数字")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("合法输入：调用建号并提示成功", async () => {
    mockCreate.mockResolvedValue({
      id: "a1",
      phone: "13800138000",
      display_name: "小王",
      level: "admin",
      status: "active",
      created_at: "2026-07-06T00:00:00Z"
    });
    renderModal();
    fill({
      phone: "13800138000",
      password: "str0ng-admin-pw!",
      display_name: "小王"
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        phone: "13800138000",
        password: "str0ng-admin-pw!",
        display_name: "小王",
        level: "admin"
      })
    );
    expect(await screen.findByText("已创建管理员「小王」")).toBeInTheDocument();
  });

  it("填了邮箱则一并提交", async () => {
    mockCreate.mockResolvedValue({
      id: "a1",
      phone: "13800138000",
      display_name: "小王",
      email: "wang@example.com",
      level: "admin",
      status: "active",
      created_at: "2026-07-06T00:00:00Z"
    });
    renderModal();
    fill({
      phone: "13800138000",
      password: "str0ng-admin-pw!",
      display_name: "小王"
    });
    fireEvent.change(screen.getByPlaceholderText("可选"), {
      target: { value: "wang@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: "wang@example.com" })
      )
    );
  });

  it("手机号重复 409：就地标红手机号字段", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(409, "phone already registered")
    );
    renderModal();
    fill({
      phone: "13800138000",
      password: "str0ng-admin-pw!",
      display_name: "小王"
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("该手机号已被占用")).toBeInTheDocument();
  });

  it("非 409 错误走通用错误提示", async () => {
    mockCreate.mockRejectedValue(new Error("server boom"));
    renderModal();
    fill({
      phone: "13800138000",
      password: "str0ng-admin-pw!",
      display_name: "小王"
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("server boom")).toBeInTheDocument();
  });
});
