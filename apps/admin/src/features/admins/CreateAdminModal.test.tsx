import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  api: { admins: { create: vi.fn() } }
}));

import { HttpError } from "@tsz/api-client";
import type { CreateAdminResponse } from "@tsz/types";
import { api } from "@/lib/auth";
import { CreateAdminModal } from "./CreateAdminModal";

// 表单校验/提交为异步，覆盖率插桩下全量并行运行偏慢，放宽超时抗竞争。
vi.setConfig({ testTimeout: 15000 });

const mockCreate = vi.mocked(api.admins.create);

// 后端 201：新账号 + 一次性临时密码（前端不再传密码/等级，等级恒为 admin）。
function createResponse(
  over?: Partial<CreateAdminResponse>
): CreateAdminResponse {
  return {
    admin: {
      id: "a1",
      phone: "13800138000",
      display_name: "小王",
      level: "admin",
      status: "active",
      created_at: "2026-07-06T00:00:00Z"
    },
    temporary_password: "Kd7mNpQ2rXt9",
    ...over
  };
}

function renderModal(onCreated = vi.fn(), onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AntApp>
        <CreateAdminModal open onClose={onClose} onCreated={onCreated} />
      </AntApp>
    </QueryClientProvider>
  );
  return { onCreated, onClose };
}

function fill(values: {
  phone?: string;
  display_name?: string;
  email?: string;
}) {
  if (values.phone !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("登录用手机号"), {
      target: { value: values.phone }
    });
  }
  if (values.display_name !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("管理员昵称"), {
      target: { value: values.display_name }
    });
  }
  if (values.email !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("可选"), {
      target: { value: values.email }
    });
  }
}

const CREATE = /^创\s?建$/;

beforeEach(() => vi.clearAllMocks());

describe("CreateAdminModal", () => {
  it("不再收集密码/等级：无密码框与等级下拉", () => {
    renderModal();
    expect(
      screen.queryByPlaceholderText("至少 12 位，非纯数字")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("权限等级")).not.toBeInTheDocument();
  });

  it("昵称含 < > 被拦截", async () => {
    renderModal();
    fill({ phone: "13800138000", display_name: "a<b" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(
      await screen.findByText("昵称不能包含 < > 或控制字符")
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("合法输入：只提交 phone/display_name，成功把临时密码交父级", async () => {
    mockCreate.mockResolvedValue(createResponse());
    const { onCreated, onClose } = renderModal();
    fill({ phone: "13800138000", display_name: "小王" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        phone: "13800138000",
        display_name: "小王"
      })
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        password: "Kd7mNpQ2rXt9",
        name: "小王"
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("填了邮箱则一并提交", async () => {
    mockCreate.mockResolvedValue(createResponse());
    renderModal();
    fill({
      phone: "13800138000",
      display_name: "小王",
      email: "wang@example.com"
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
    fill({ phone: "13800138000", display_name: "小王" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("该手机号已被占用")).toBeInTheDocument();
  });

  it("邮箱重复 409：就地标红邮箱字段", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(409, "email already registered")
    );
    renderModal();
    fill({
      phone: "13800138000",
      display_name: "小王",
      email: "wang@example.com"
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("该邮箱已被占用")).toBeInTheDocument();
  });

  it("409 但文案无法识别是手机还是邮箱：退回通用提示、不臆断标字段", async () => {
    mockCreate.mockRejectedValue(new HttpError(409, "conflict"));
    renderModal();
    fill({ phone: "13800138000", display_name: "小王" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(
      await screen.findByText("该手机号或邮箱已被占用")
    ).toBeInTheDocument();
  });

  it("非 409 错误走通用错误提示", async () => {
    mockCreate.mockRejectedValue(new Error("server boom"));
    renderModal();
    fill({ phone: "13800138000", display_name: "小王" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("server boom")).toBeInTheDocument();
  });

  it("非 Error 拒绝：回退到通用文案「创建失败」", async () => {
    mockCreate.mockRejectedValue("boom");
    renderModal();
    fill({ phone: "13800138000", display_name: "小王" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("创建失败")).toBeInTheDocument();
  });
});
