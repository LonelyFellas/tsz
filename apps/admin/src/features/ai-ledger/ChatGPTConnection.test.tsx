import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { ChatGPTConnection } from "./ChatGPTConnection";

vi.mock("@/lib/auth", () => ({
  api: {
    chatgpt: {
      setup: vi.fn(),
      accounts: vi.fn(),
      login: vi.fn(),
      loginStatus: vi.fn(),
      cancelLogin: vi.fn(),
      useAccount: vi.fn(),
      logout: vi.fn()
    }
  }
}));
const attempt = {
  attempt_id: "00000000-0000-0000-0000-000000000001",
  authorization_url:
    "https://auth.openai.com/api/accounts/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback",
  expires_at: new Date(Date.now() + 300_000).toISOString()
};
const empty = {
  configured: true,
  active: null,
  accounts: [],
  pending_login: null
};
const loggedIn = {
  ...empty,
  active: "oaiapp_test",
  accounts: [
    {
      client_id: "oaiapp_test",
      email: "fixture@example.test",
      signed_in: true,
      plan_enabled: true
    }
  ]
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(api.chatgpt.setup).mockResolvedValue({ login_method: "local" });
  vi.mocked(api.chatgpt.accounts).mockResolvedValue(empty);
  vi.mocked(api.chatgpt.login).mockResolvedValue(attempt);
  vi.mocked(api.chatgpt.loginStatus).mockResolvedValue({
    status: "pending",
    expires_at: attempt.expires_at,
    error: null
  });
  vi.mocked(api.chatgpt.cancelLogin).mockResolvedValue({
    status: "cancelled",
    expires_at: attempt.expires_at,
    error: null
  });
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <ConfigProvider locale={zhCN} theme={{ token: { motion: false } }}>
      <App>
        <QueryClientProvider client={client}>
          <ChatGPTConnection adminId="fixture-admin" />
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}
const summary = () =>
  within(screen.getByRole("region", { name: "ChatGPT 账号", hidden: true }));
const drawer = () => screen.getByRole("dialog", { name: "ChatGPT 账号" });

it("账号列表保持简洁，点击登录才打开授权；取消失败保留入口", async () => {
  mount();
  await summary().findByText("未登录");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "登录 ChatGPT" }));
  const link = await screen.findByRole("link", { name: "前往 ChatGPT 授权" });
  expect(link).toHaveAttribute("href", attempt.authorization_url);
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  vi.mocked(api.chatgpt.cancelLogin).mockRejectedValueOnce(
    new Error("private-token-details")
  );
  fireEvent.click(screen.getByRole("button", { name: "取消 ChatGPT 登录" }));
  await screen.findByText("取消 ChatGPT 登录失败，请重试。");
  expect(
    screen.getByRole("link", { name: "前往 ChatGPT 授权" })
  ).toBeInTheDocument();
  expect(screen.queryByText("private-token-details")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消 ChatGPT 登录" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "前往 ChatGPT 授权" })
    ).not.toBeInTheDocument()
  );
});
it("授权完成后重读账号，首次说明套餐用途，退出保留撤销提示", async () => {
  vi.mocked(api.chatgpt.loginStatus).mockResolvedValue({
    status: "complete",
    expires_at: attempt.expires_at,
    error: null
  });
  mount();
  await summary().findByText("未登录");
  vi.mocked(api.chatgpt.accounts).mockResolvedValue(loggedIn);
  fireEvent.click(screen.getByRole("button", { name: "登录 ChatGPT" }));
  await waitFor(() => expect(api.chatgpt.login).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(api.chatgpt.loginStatus).toHaveBeenCalled());
  const notice = await screen.findByText("使用 ChatGPT 套餐", {
    selector: ".ant-modal-title"
  });
  fireEvent.click(screen.getByRole("button", { name: "知道了" }));
  await waitFor(() => expect(notice).not.toBeVisible());
  expect(
    within(drawer()).getByRole("combobox", { name: "ChatGPT 账号" })
  ).toBeInTheDocument();
  vi.mocked(api.chatgpt.logout).mockResolvedValue({ remote_revoked: false });
  vi.mocked(api.chatgpt.accounts).mockResolvedValue({
    ...loggedIn,
    accounts: loggedIn.accounts.map((a) => ({
      ...a,
      signed_in: false,
      plan_enabled: false
    }))
  });
  fireEvent.click(screen.getByRole("button", { name: "退出 ChatGPT" }));
  await screen.findByText(
    "本地已退出，远端撤销未确认。请前往 ChatGPT 用量设置断开此应用。"
  );
  expect(api.chatgpt.logout).toHaveBeenCalledWith("oaiapp_test");
  await summary().findByText("未登录");
});
it("重开页面恢复待完成授权，未启用或账号状态失败时不能登录", async () => {
  vi.mocked(api.chatgpt.accounts).mockResolvedValue({
    ...empty,
    pending_login: attempt
  });
  const view = mount();
  await screen.findByRole("link", { name: "前往 ChatGPT 授权" });
  expect(api.chatgpt.login).not.toHaveBeenCalled();
  view.unmount();
  vi.mocked(api.chatgpt.accounts).mockResolvedValue({
    ...empty,
    configured: false
  });
  mount();
  await summary().findByText("未启用");
  expect(screen.getByRole("button", { name: "登录 ChatGPT" })).toBeDisabled();
  vi.mocked(api.chatgpt.accounts).mockRejectedValue(
    new Error("private-server-details")
  );
  fireEvent.click(
    screen.getByRole("button", { name: "刷新 ChatGPT 账号状态" })
  );
  await summary().findByText("状态不可用");
  expect(screen.getByRole("button", { name: "登录 ChatGPT" })).toBeDisabled();
  expect(screen.queryByText("private-server-details")).not.toBeInTheDocument();
});
it("服务器命令只在抽屉内显示，刷新账号后支持重授权与新增", async () => {
  vi.mocked(api.chatgpt.setup).mockResolvedValue({ login_method: "ssh" });
  mount();
  await summary().findByText("未登录");
  expect(screen.queryByText("在电脑上登录")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "登录 ChatGPT" }));
  await screen.findByText("在电脑上登录");
  fireEvent.change(screen.getByRole("textbox", { name: "SSH 主机" }), {
    target: { value: "fixture-host" }
  });
  const command =
    "uv run python -m tsz_agent.auth login chatgpt --ssh-host 'fixture-host'";
  await screen.findByText(command);
  expect(api.chatgpt.login).not.toHaveBeenCalled();
  vi.mocked(api.chatgpt.accounts).mockResolvedValue(loggedIn);
  fireEvent.click(screen.getByRole("button", { name: "刷新账号" }));
  fireEvent.click(await screen.findByRole("button", { name: "知道了" }));
  expect(screen.queryByText("在电脑上登录")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新登录" }));
  expect(screen.getByRole("textbox", { name: "SSH 主机" })).toHaveValue(
    "fixture-host"
  );
  await screen.findByText(command + " --account 'oaiapp_test'");
  fireEvent.click(screen.getByRole("button", { name: "添加其他账号" }));
  await screen.findByText(command);
  expect(api.chatgpt.login).not.toHaveBeenCalled();
});
it("登录方式未知时不启动回调", async () => {
  vi.mocked(api.chatgpt.setup).mockRejectedValue(
    new Error("private-config-error")
  );
  mount();
  await summary().findByText("登录暂不可用");
  expect(screen.getByRole("button", { name: "登录 ChatGPT" })).toBeDisabled();
  expect(screen.queryByText("private-config-error")).not.toBeInTheDocument();
});
it("关闭抽屉不取消授权，再打开可继续且不重复发起", async () => {
  mount();
  await summary().findByText("未登录");
  fireEvent.click(screen.getByRole("button", { name: "登录 ChatGPT" }));
  await screen.findByRole("link", { name: "前往 ChatGPT 授权" });
  fireEvent.click(within(drawer()).getByRole("button", { name: "关闭" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "ChatGPT 账号" })
    ).not.toBeInTheDocument()
  );
  expect(api.chatgpt.cancelLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "继续登录 ChatGPT" }));
  await screen.findByRole("link", { name: "前往 ChatGPT 授权" });
  expect(api.chatgpt.login).toHaveBeenCalledTimes(1);
});
