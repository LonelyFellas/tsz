import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { ChatGPTConnection } from "./ChatGPTConnection";

vi.mock("@/lib/auth", () => ({
  api: {
    chatgpt: {
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
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <QueryClientProvider client={client}>
          <ChatGPTConnection adminId="fixture-admin" />
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}

it("发起官方授权，取消失败保留入口且不显示上游敏感错误", async () => {
  mount();
  await screen.findByText("未登录");
  fireEvent.click(
    screen.getByRole("button", { name: /Continue with ChatGPT/ })
  );
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

it("授权完成后读取账号，首次说明套餐用途；退出保留远端撤销提示", async () => {
  vi.mocked(api.chatgpt.loginStatus).mockResolvedValue({
    status: "complete",
    expires_at: attempt.expires_at,
    error: null
  });
  mount();
  await screen.findByText("未登录");
  vi.mocked(api.chatgpt.accounts).mockResolvedValue(loggedIn);
  fireEvent.click(
    screen.getByRole("button", { name: /Continue with ChatGPT/ })
  );
  await screen.findByText("已授权套餐");
  expect(
    within(await screen.findByRole("dialog")).getByText(
      "你正在使用 ChatGPT 套餐"
    )
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "知道了" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(
    screen.getByRole("combobox", { name: "ChatGPT 账号" })
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
  await screen.findByText("未登录");
});

it("重开页面能恢复待完成授权；未配置或状态失败不能发起登录", async () => {
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
  await screen.findByText(
    "此 Agent 尚未启用 ChatGPT 登录，请先在本机启用后刷新。"
  );
  expect(
    screen.getByRole("button", { name: /Continue with ChatGPT/ })
  ).toBeDisabled();
  vi.mocked(api.chatgpt.accounts).mockRejectedValue(
    new Error("private-server-details")
  );
  fireEvent.click(
    screen.getByRole("button", { name: "刷新 ChatGPT 账号状态" })
  );
  await screen.findByText("无法读取 ChatGPT 账号状态，请刷新重试。");
  expect(
    screen.getByRole("button", { name: /Continue with ChatGPT/ })
  ).toBeDisabled();
});
