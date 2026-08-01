import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  api: { admins: { create: vi.fn(), requestCreateCode: vi.fn() } }
}));

import { HttpError } from "@tsz/api-client";
import type { CreateAdminResponse } from "@tsz/types";
import { api } from "@/lib/auth";
import { CreateAdminModal } from "./CreateAdminModal";

// 表单校验/提交为异步，覆盖率插桩下全量并行运行偏慢，放宽超时抗竞争。
vi.setConfig({ testTimeout: 15000 });

const mockCreate = vi.mocked(api.admins.create);
const mockRequestCode = vi.mocked(api.admins.requestCreateCode);

// 后端 201：新账号 + 一次性临时密码（前端不再传密码/等级，等级恒为 admin）。
function createResponse(
  over?: Partial<CreateAdminResponse>
): CreateAdminResponse {
  return {
    admin: {
      id: "a1",
      phone: "13800138000",
      display_name: "小王",
      role: "admin",
      status: "active",
      created_at: "2026-07-06T00:00:00Z",
      updated_at: "2026-07-06T00:00:00Z",
      created_by: null
    },
    temporary_password: "Kd7mNpQ2rXt9",
    ...over
  };
}

function renderModal(
  onCreated = vi.fn(),
  onClose = vi.fn(),
  onPendingChange = vi.fn()
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AntApp>
        <CreateAdminModal
          open
          onClose={onClose}
          onPendingChange={onPendingChange}
          onCreated={onCreated}
        />
      </AntApp>
    </QueryClientProvider>
  );
  return { onCreated, onClose, onPendingChange };
}

function fill(values: {
  phone?: string;
  display_name?: string;
  code?: string;
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
  if (values.code !== undefined) {
    fireEvent.change(
      screen.getByPlaceholderText("当前超管手机号收到的 6 位验证码"),
      {
        target: { value: values.code }
      }
    );
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
    fill({ phone: "13800138000", display_name: "a<b", code: "123456" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(
      await screen.findByText("昵称不能包含 < > 或控制字符")
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("合法输入：提交 phone/display_name/code，成功把临时密码交父级", async () => {
    mockCreate.mockResolvedValue(createResponse());
    const { onCreated, onClose } = renderModal();
    fill({ phone: "13800138000", display_name: "小王", code: "123456" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        phone: "13800138000",
        display_name: "小王",
        code: "123456"
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

  it("建号请求进行中禁止取消和重复提交", async () => {
    let resolveCreate!: (value: CreateAdminResponse) => void;
    mockCreate.mockReturnValue(
      new Promise<CreateAdminResponse>((resolve) => {
        resolveCreate = resolve;
      })
    );
    const { onClose, onPendingChange } = renderModal();
    fill({ phone: "13800138000", display_name: "小王", code: "123456" });

    const createButton = screen.getByRole("button", { name: CREATE });
    fireEvent.click(createButton);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(onPendingChange).toHaveBeenCalledWith(true);

    const cancelButton = screen.getByRole("button", { name: /取\s*消/ });
    expect(cancelButton).toBeDisabled();
    expect(createButton).toBeDisabled();
    fireEvent.click(cancelButton);
    fireEvent.click(createButton);
    expect(onClose).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    resolveCreate(createResponse());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("点击获取验证码调用超管建号发码接口", async () => {
    mockRequestCode.mockResolvedValue(undefined);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
    await waitFor(() => expect(mockRequestCode).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("验证码已发送至当前超级管理员手机号")
    ).toBeInTheDocument();
  });

  it("手机号重复 409：就地标红手机号字段", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(409, "phone already registered")
    );
    renderModal();
    fill({ phone: "13800138000", display_name: "小王", code: "123456" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("该手机号已被占用")).toBeInTheDocument();
  });

  it("验证码错误 400：就地标红验证码字段", async () => {
    mockCreate.mockRejectedValue(new HttpError(400, "invalid code"));
    renderModal();
    fill({ phone: "13800138000", display_name: "小王", code: "123456" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("验证码无效或已过期")).toBeInTheDocument();
  });

  it("非 409 错误走通用错误提示", async () => {
    mockCreate.mockRejectedValue(new Error("server boom"));
    renderModal();
    fill({ phone: "13800138000", display_name: "小王", code: "123456" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("server boom")).toBeInTheDocument();
  });

  it("非 Error 拒绝：回退到通用文案「创建失败」", async () => {
    mockCreate.mockRejectedValue("boom");
    renderModal();
    fill({ phone: "13800138000", display_name: "小王", code: "123456" });
    fireEvent.click(screen.getByRole("button", { name: CREATE }));
    expect(await screen.findByText("创建失败")).toBeInTheDocument();
  });
});
