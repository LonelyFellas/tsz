import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type {
  AccountDeletionState,
  AccountDeletionRequest,
  User
} from "@tsz/types";
import { useUserStore } from "@/stores/user";
import { DeleteAccountForm } from "./DeleteAccountForm";
const mockBack = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mockBack }) }));
vi.mock("@/lib/request", () => ({
  clearSession: vi.fn(),
  api: {
    auth: {
      requestDeletionCode: vi.fn(),
      deleteAccount: vi.fn(),
      accountDeletion: vi.fn(),
      requestAccountDeletion: vi.fn(),
      cancelAccountDeletion: vi.fn()
    }
  }
}));
import { api, clearSession } from "@/lib/request";
const initial: AccountDeletionState = {
  request: null,
  coin_balance: "100",
  consent_version: "v1",
  consent_text: "申请等待连续72小时，期间可撤销且暂停钱包收支，到期余额作废。",
  server_time: "2026-10-06T00:00:00Z"
};
const pending: AccountDeletionRequest = {
  id: "request-1",
  status: "pending",
  requested_at: "2026-10-06T00:00:00Z",
  effective_at: "2026-10-09T00:00:00Z",
  cancelled_at: null,
  completed_at: null,
  confirmed_balance: "100",
  waive_balance: true,
  consent_version: "v1",
  consent_text: initial.consent_text
};
function seedUser(
  input: { phone?: string; email?: string } = {
    phone: "13899997777",
    email: "alice@example.com"
  }
) {
  const user: User = {
    id: "u1",
    display_name: "Alice",
    avatar_url: "",
    roles: ["student"],
    active_role: "student",
    ...input
  };
  useUserStore.setState({ user });
}
async function openConfirmation() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "获取验证码" }));
  await user.type(screen.getByPlaceholderText("6 位数字验证码"), "000000");
  await user.click(screen.getByRole("button", { name: "继续注销" }));
  return user;
}
beforeEach(() => {
  vi.resetAllMocks();
  seedUser();
  vi.mocked(api.auth.accountDeletion).mockResolvedValue(
    structuredClone(initial)
  );
  vi.mocked(api.auth.requestDeletionCode).mockResolvedValue(undefined);
  vi.mocked(api.auth.requestAccountDeletion).mockResolvedValue(
    structuredClone(pending)
  );
  vi.mocked(api.auth.cancelAccountDeletion).mockResolvedValue({
    ...pending,
    status: "cancelled",
    cancelled_at: "2026-10-06T01:00:00Z"
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: mockReplace }
  });
});
describe("DeleteAccountForm 72小时注销", () => {
  it("主动签署精确余额后提交，成功保留会话且不宣称已删除", async () => {
    render(<DeleteAccountForm />);
    const user = await openConfirmation();
    const checkbox = screen.getByRole("checkbox", {
      name: /主动放弃本次确认的 100 天生币/
    });
    expect(checkbox).not.toBeChecked();
    const submit = screen.getByRole("button", { name: "提交注销申请" });
    expect(submit).toBeDisabled();
    await user.click(checkbox);
    await user.click(submit);
    expect(
      await screen.findByRole("heading", { name: "注销申请等待生效" })
    ).toBeInTheDocument();
    expect(api.auth.requestAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_coin_balance: "100",
        waive_balance: true,
        confirm_deletion: true,
        idempotency_key: expect.any(String)
      })
    );
    expect(clearSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(api.auth.deleteAccount).not.toHaveBeenCalled();
  });
  it("零余额同样主动确认72小时规则，且保持整数精度", async () => {
    vi.mocked(api.auth.accountDeletion).mockResolvedValue({
      ...initial,
      coin_balance: "0"
    });
    render(<DeleteAccountForm />);
    const user = await openConfirmation();
    await user.click(
      screen.getByRole("checkbox", { name: /零余额也等待连续 72 小时/ })
    );
    await user.click(screen.getByRole("button", { name: "提交注销申请" }));
    await waitFor(() =>
      expect(api.auth.requestAccountDeletion).toHaveBeenCalledWith(
        expect.objectContaining({
          expected_coin_balance: "0",
          waive_balance: false,
          confirm_deletion: true
        })
      )
    );
  });
  it("重新进入恢复待注销状态，无联系方式仍能显式撤销", async () => {
    seedUser({});
    vi.mocked(api.auth.accountDeletion).mockResolvedValue({
      ...initial,
      request: pending
    });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "撤销注销申请" })
    );
    await waitFor(() =>
      expect(api.auth.cancelAccountDeletion).toHaveBeenCalledWith("request-1")
    );
    expect(
      await screen.findByRole("heading", { name: "无法注销账号" })
    ).toBeInTheDocument();
    expect(clearSession).not.toHaveBeenCalled();
  });
  it("余额冲突重新加载金额并清除旧签署", async () => {
    vi.mocked(api.auth.accountDeletion)
      .mockResolvedValueOnce(initial)
      .mockResolvedValue({ ...initial, coin_balance: "9007199254740993" });
    vi.mocked(api.auth.requestAccountDeletion).mockRejectedValueOnce(
      new HttpError(409, "changed", [], "account_deletion_balance_changed")
    );
    render(<DeleteAccountForm />);
    const user = await openConfirmation();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "提交注销申请" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "继续注销" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByText("本次确认余额：9007199254740993 天生币")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "提交注销申请" }));
    const calls = vi.mocked(api.auth.requestAccountDeletion).mock.calls;
    expect(calls[1]![0].idempotency_key).not.toBe(calls[0]![0].idempotency_key);
  });
  it("网络未知结果保留意图键，恢复查询后可安全重试", async () => {
    vi.mocked(api.auth.requestAccountDeletion)
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(pending);
    render(<DeleteAccountForm />);
    const user = await openConfirmation();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "提交注销申请" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "提交注销申请" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "提交注销申请" }));
    await screen.findByRole("heading", { name: "注销申请等待生效" });
    const calls = vi.mocked(api.auth.requestAccountDeletion).mock.calls;
    expect(calls[1]![0].idempotency_key).toBe(calls[0]![0].idempotency_key);
  });
  it("旧后端404显示不可用，不回退旧DELETE或伪造余额", async () => {
    vi.mocked(api.auth.accountDeletion).mockRejectedValue(
      new HttpError(404, "missing")
    );
    render(<DeleteAccountForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "注销申请服务暂不可用"
    );
    expect(
      screen.queryByRole("button", { name: "获取验证码" })
    ).not.toBeInTheDocument();
    expect(api.auth.deleteAccount).not.toHaveBeenCalled();
  });
  it("键盘焦点覆盖新增签署项；验证码错误不清会话", async () => {
    vi.mocked(api.auth.requestAccountDeletion).mockRejectedValue(
      new HttpError(401, "wrong", [], "invalid_account_deletion_code")
    );
    render(<DeleteAccountForm />);
    const user = await openConfirmation();
    await user.tab();
    expect(screen.getByRole("checkbox")).toHaveFocus();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "提交注销申请" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("验证码错误");
    expect(clearSession).not.toHaveBeenCalled();
  });
});

it.each([
  { coin_balance: "200" },
  { consent_version: "v2", consent_text: "更新后的声明" }
])("网络失败恢复后的签署内容变化必须重新主动确认 %j", async (change) => {
  vi.mocked(api.auth.accountDeletion)
    .mockResolvedValueOnce(initial)
    .mockResolvedValue({ ...initial, ...change });
  vi.mocked(api.auth.requestAccountDeletion).mockRejectedValueOnce(
    new TypeError("response lost")
  );
  render(<DeleteAccountForm />);
  const user = await openConfirmation();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "提交注销申请" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  await user.click(screen.getByRole("button", { name: "继续注销" }));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "提交注销申请" })).toBeDisabled();
});

it("另一页撤销后，旧键重放的cancelled结果不冒充新申请成功", async () => {
  const cancelled: AccountDeletionRequest = {
    ...pending,
    status: "cancelled",
    cancelled_at: "2026-10-06T01:00:00Z"
  };
  vi.mocked(api.auth.accountDeletion)
    .mockResolvedValueOnce(initial)
    .mockResolvedValue({ ...initial, request: cancelled });
  vi.mocked(api.auth.requestAccountDeletion)
    .mockRejectedValueOnce(new TypeError("response lost"))
    .mockResolvedValueOnce(cancelled);
  render(<DeleteAccountForm />);
  const user = await openConfirmation();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "提交注销申请" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "提交注销申请" })).toBeEnabled()
  );
  await user.click(screen.getByRole("button", { name: "提交注销申请" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  const calls = vi.mocked(api.auth.requestAccountDeletion).mock.calls;
  expect(calls[1]![0].idempotency_key).toBe(calls[0]![0].idempotency_key);
  expect(screen.getByRole("status")).toHaveTextContent("已撤销");
  expect(screen.getByRole("status")).not.toHaveTextContent("申请已保存");
  expect(screen.getByPlaceholderText("6 位数字验证码")).toHaveValue("");
  expect(screen.getByRole("button", { name: "继续注销" })).toBeDisabled();
  expect(clearSession).not.toHaveBeenCalled();
});
