import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserView } from "@tsz/types";

vi.mock("@/lib/auth", () => ({
  api: { users: { update: vi.fn() } }
}));

import { api } from "@/lib/auth";
import { EditUserModal } from "./EditUserModal";

vi.setConfig({ testTimeout: 15000 });

const mockUpdate = vi.mocked(api.users.update);

const user: AdminUserView = {
  id: "u7",
  display_name: "Frank",
  avatar_url: "",
  roles: ["student"],
  status: "active",
  created_at: "2026-06-01T08:00:00Z",
  updated_at: "2026-06-01T08:00:00Z"
};

beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockImplementation(async (_id, input) => ({
    ...user,
    display_name: input.display_name
  }));
});

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <AntApp>
        <EditUserModal user={user} onClose={onClose} />
      </AntApp>
    </QueryClientProvider>
  );
  return onClose;
}

describe("EditUserModal", () => {
  it("预填当前昵称", async () => {
    renderModal();
    expect(await screen.findByDisplayValue("Frank")).toBeInTheDocument();
  });

  it("保存成功：调用 update、提示已保存、关闭弹窗", async () => {
    const onClose = renderModal();
    const input = await screen.findByDisplayValue("Frank");
    fireEvent.change(input, { target: { value: "Franklin" } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("已保存")).toBeInTheDocument();
    expect(mockUpdate).toHaveBeenCalledWith("u7", { display_name: "Franklin" });
    expect(onClose).toHaveBeenCalled();
  });

  it("昵称清空：校验拦截，不发请求、不关闭", async () => {
    const onClose = renderModal();
    const input = await screen.findByDisplayValue("Frank");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("请输入用户昵称")).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("保存失败（Error）：透传后端消息，不关闭弹窗", async () => {
    const onClose = renderModal();
    mockUpdate.mockRejectedValueOnce(new Error("昵称已被占用"));
    const input = await screen.findByDisplayValue("Frank");
    fireEvent.change(input, { target: { value: "阿强" } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("昵称已被占用")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("保存失败（非 Error）：回退到「保存失败」文案", async () => {
    renderModal();
    mockUpdate.mockRejectedValueOnce("weird");
    const input = await screen.findByDisplayValue("Frank");
    fireEvent.change(input, { target: { value: "阿强" } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("保存失败")).toBeInTheDocument();
  });
});
