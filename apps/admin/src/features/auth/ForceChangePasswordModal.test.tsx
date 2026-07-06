import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  api: { auth: { changePassword: vi.fn() } }
}));

import { api } from "@/lib/auth";
import { ForceChangePasswordModal } from "./ForceChangePasswordModal";

// 弹窗含 antd 表单校验 + 异步 mutation + message 门户，覆盖率插桩下偏慢，放宽超时。
vi.setConfig({ testTimeout: 15000 });

const mockChange = vi.mocked(api.auth.changePassword);
const OK = { name: "修改并进入" };

async function renderModal() {
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  render(
    <AntApp>
      <ForceChangePasswordModal
        open
        currentPassword="old-temp-pw!!"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </AntApp>
  );
  await screen.findByText("请先修改初始密码");
  return { onSuccess, onCancel };
}

function fill(newPw: string, confirm = newPw) {
  fireEvent.change(screen.getByPlaceholderText("至少 12 位，非纯数字"), {
    target: { value: newPw }
  });
  fireEvent.change(screen.getByPlaceholderText("再次输入新密码"), {
    target: { value: confirm }
  });
}

beforeEach(() => vi.clearAllMocks());

describe("ForceChangePasswordModal", () => {
  it("新密码不足 12 位被拦截，不打后端", async () => {
    await renderModal();
    fill("short");
    fireEvent.click(screen.getByRole("button", OK));
    expect(await screen.findByText("密码至少 12 位")).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("纯数字新密码被拦截", async () => {
    await renderModal();
    fill("123456789012");
    fireEvent.click(screen.getByRole("button", OK));
    expect(await screen.findByText("密码不能是纯数字")).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("新密码与当前相同被拦截", async () => {
    await renderModal();
    fill("old-temp-pw!!");
    fireEvent.click(screen.getByRole("button", OK));
    expect(
      await screen.findByText("新密码不能与当前密码相同")
    ).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("两次输入不一致被拦截", async () => {
    await renderModal();
    fill("brand-new-pw-2026", "brand-new-pw-XXXX");
    fireEvent.click(screen.getByRole("button", OK));
    expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("合法输入：调改密并回调 onSuccess", async () => {
    mockChange.mockResolvedValue(undefined);
    const { onSuccess } = await renderModal();
    fill("brand-new-pw-2026");
    fireEvent.click(screen.getByRole("button", OK));
    await waitFor(() =>
      expect(mockChange).toHaveBeenCalledWith(
        "old-temp-pw!!",
        "brand-new-pw-2026"
      )
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("后端 400：就地标红新密码字段，不回调 onSuccess", async () => {
    mockChange.mockRejectedValue(
      new Error("new password must differ from the current one")
    );
    const { onSuccess } = await renderModal();
    fill("brand-new-pw-2026");
    fireEvent.click(screen.getByRole("button", OK));
    expect(
      await screen.findByText("new password must differ from the current one")
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("点退出登录触发 onCancel", async () => {
    const { onCancel } = await renderModal();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
