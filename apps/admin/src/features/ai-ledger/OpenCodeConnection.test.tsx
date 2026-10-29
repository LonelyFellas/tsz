import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { OpenCodeConnection } from "./OpenCodeConnection";

vi.mock("@/lib/auth", () => ({
  api: {
    opencode: {
      connection: vi.fn(),
      login: vi.fn(),
      loginStatus: vi.fn(),
      cancelLogin: vi.fn()
    }
  }
}));

const attempt = {
  attempt_id: "attempt_123",
  authorization_url: "https://opencode.ai/console/device?user_code=TEST",
  expires_at: new Date(Date.now() + 600_000).toISOString()
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.opencode.connection).mockResolvedValue({
    configured: true,
    connected: false,
    login_available: true
  });
  vi.mocked(api.opencode.login).mockResolvedValue(attempt);
  vi.mocked(api.opencode.loginStatus).mockResolvedValue({
    status: "pending",
    expires_at: attempt.expires_at
  });
  vi.mocked(api.opencode.cancelLogin).mockResolvedValue(undefined);
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <ConfigProvider>
      <App>
        <QueryClientProvider client={client}>
          <OpenCodeConnection adminId="super-test" />
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}

it("从连接入口发起官方登录，取消失败保留授权入口，成功后清除", async () => {
  mount();
  await screen.findByText("未连接");
  fireEvent.click(screen.getByRole("button", { name: /连接 OpenCode/ }));
  const link = await screen.findByRole("link", { name: "前往 OpenCode 登录" });
  expect(link).toHaveAttribute("href", attempt.authorization_url);
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(api.opencode.login).toHaveBeenCalledTimes(1);
  vi.mocked(api.opencode.cancelLogin).mockRejectedValueOnce(
    new Error("private upstream error")
  );
  fireEvent.click(screen.getByRole("button", { name: "取消登录" }));
  await screen.findByText("取消登录失败，请重试。");
  expect(
    screen.getByRole("link", { name: "前往 OpenCode 登录" })
  ).toBeInTheDocument();
  expect(screen.queryByText("private upstream error")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消登录" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "前往 OpenCode 登录" })
    ).not.toBeInTheDocument()
  );
  expect(api.opencode.cancelLogin).toHaveBeenCalledWith("attempt_123");
});

it("轮询完成后重新读取服务器连接状态", async () => {
  vi.mocked(api.opencode.loginStatus)
    .mockResolvedValueOnce({
      status: "pending",
      expires_at: attempt.expires_at
    })
    .mockResolvedValue({ status: "complete", expires_at: attempt.expires_at });
  mount();
  await screen.findByText("未连接");
  vi.mocked(api.opencode.connection).mockResolvedValue({
    configured: true,
    connected: true,
    login_available: true
  });
  fireEvent.click(screen.getByRole("button", { name: /连接 OpenCode/ }));
  await screen.findByText("等待你完成 OpenCode 授权");
  await screen.findByText("OpenCode 授权已完成。", {}, { timeout: 4000 });
  await screen.findByText("已连接");
  expect(api.opencode.connection).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByRole("link", { name: "前往 OpenCode 登录" })
  ).not.toBeInTheDocument();
});

it("服务器未配置时禁用登录，状态刷新失败后不继续使用旧状态", async () => {
  vi.mocked(api.opencode.connection).mockResolvedValueOnce({
    configured: false,
    connected: false,
    login_available: false
  });
  mount();
  await screen.findByText(
    "服务器尚未配置 OpenCode 服务，配置完成后即可在这里登录。"
  );
  expect(screen.getByRole("button", { name: /连接 OpenCode/ })).toBeDisabled();
  vi.mocked(api.opencode.connection).mockRejectedValue(
    new Error("secret-server-password")
  );
  fireEvent.click(
    screen.getByRole("button", { name: "刷新 OpenCode 连接状态" })
  );
  await screen.findByText("无法读取 OpenCode 连接状态，请刷新重试。");
  expect(screen.getByRole("button", { name: /连接 OpenCode/ })).toBeDisabled();
  expect(screen.queryByText("secret-server-password")).not.toBeInTheDocument();
  expect(api.opencode.login).not.toHaveBeenCalled();
});

it("链接过期后允许重新发起登录", async () => {
  vi.mocked(api.opencode.loginStatus).mockResolvedValue({
    status: "expired",
    expires_at: attempt.expires_at
  });
  mount();
  await screen.findByText("未连接");
  fireEvent.click(screen.getByRole("button", { name: /连接 OpenCode/ }));
  await screen.findByText("登录链接已过期，请重新连接。");
  expect(
    screen.queryByRole("link", { name: "前往 OpenCode 登录" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /连接 OpenCode/ })).toBeEnabled();
});

vi.mock("./OpenCodeModels", () => ({ OpenCodeModels: () => null }));
vi.mock("./ChatGPTConnection", () => ({ ChatGPTConnection: () => null }));

vi.mock("./OpenCodeProviders", () => ({ OpenCodeProviders: () => null }));
