import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { OpenCodeProviders } from "./OpenCodeProviders";

vi.mock("@/lib/auth", () => ({
  api: {
    opencode: {
      connectedProviders: vi.fn(),
      disconnectConnection: vi.fn(),
      activateConnection: vi.fn()
    }
  }
}));
const oauth = {
  id: "cred_oauth",
  method: "oauth" as const,
  label: "TSZ",
  active: true
};
const key = {
  id: "cred_key_one",
  method: "key" as const,
  label: "TSZ",
  active: false
};
const keyTwo = {
  id: "cred_key_two",
  method: "key" as const,
  label: "TSZ",
  active: false
};
const env = {
  id: null,
  method: "env" as const,
  label: "TEST_KEY",
  active: false
};
const report = (connections = [oauth, key, keyTwo, env]) => ({
  providers: [{ id: "opencode", name: "OpenCode", connections }]
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.opencode.connectedProviders).mockResolvedValue(report());
  vi.mocked(api.opencode.disconnectConnection).mockResolvedValue(undefined);
  vi.mocked(api.opencode.activateConnection).mockResolvedValue(undefined);
});
function mount(disabled = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <ConfigProvider>
      <App>
        <QueryClientProvider client={client}>
          <OpenCodeProviders adminId="super-test" disabled={disabled} />
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
  return invalidate;
}
it("分别展示授权和多份 Key，切换后重新读取实际当前项", async () => {
  const invalidate = mount();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "使用 OpenCode API Key · TSZ · …_key_one"
    })
  );
  expect(api.opencode.activateConnection).not.toHaveBeenCalled();
  vi.mocked(api.opencode.connectedProviders).mockResolvedValue(
    report([{ ...key, active: true }, { ...oauth, active: false }, keyTwo, env])
  );
  fireEvent.click(await screen.findByRole("button", { name: "确认切换" }));
  await screen.findByText("当前凭据已切换，请重新探测模型。");
  expect(api.opencode.activateConnection).toHaveBeenCalledExactlyOnceWith(
    "opencode",
    "cred_key_one"
  );
  expect(
    screen.queryByRole("button", {
      name: "使用 OpenCode API Key · TSZ · …_key_one"
    })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "使用 OpenCode 登录授权 · TSZ · …ed_oauth"
    })
  ).toBeEnabled();
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["opencode-model-probes", "super-test"]
  });
  expect(
    screen.getByRole("button", {
      name: "登出 OpenCode API Key · TSZ · …_key_two"
    })
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: /登出.*环境变量/ })
  ).not.toBeInTheDocument();
});
it("仅登出所选 Key，授权和另一份 Key 保留", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "登出 OpenCode API Key · TSZ · …_key_one"
    })
  );
  expect(api.opencode.disconnectConnection).not.toHaveBeenCalled();
  vi.mocked(api.opencode.connectedProviders).mockResolvedValue(
    report([oauth, keyTwo, env])
  );
  fireEvent.click(await screen.findByRole("button", { name: "确认登出" }));
  await screen.findByText(
    "这份凭据已登出，其他凭据已保留；当前使用项以列表为准。"
  );
  expect(api.opencode.disconnectConnection).toHaveBeenCalledExactlyOnceWith(
    "opencode",
    "cred_key_one"
  );
  expect(
    screen.queryByRole("button", {
      name: "登出 OpenCode API Key · TSZ · …_key_one"
    })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "登出 OpenCode 登录授权 · TSZ · …ed_oauth"
    })
  ).toBeEnabled();
  expect(
    screen.getByRole("button", {
      name: "登出 OpenCode API Key · TSZ · …_key_two"
    })
  ).toBeEnabled();
});
it("删除当前授权前说明自动切换，失败不伪报成功并允许重试", async () => {
  vi.mocked(api.opencode.disconnectConnection).mockRejectedValue(
    new Error("private token")
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "登出 OpenCode 登录授权 · TSZ · …ed_oauth"
    })
  );
  await screen.findByText(/OpenCode 将自动使用剩余凭据/);
  fireEvent.click(await screen.findByRole("button", { name: "确认登出" }));
  await screen.findByText("未能确认凭据操作完成，请刷新连接后重试。");
  expect(screen.queryByText("private token")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(api.opencode.connectedProviders).toHaveBeenCalledTimes(2)
  );
  expect(
    screen.getByRole("button", {
      name: "登出 OpenCode 登录授权 · TSZ · …ed_oauth"
    })
  ).toBeEnabled();
});
it("正在登录时禁用切换和登出", async () => {
  mount(true);
  expect(
    await screen.findByRole("button", {
      name: "登出 OpenCode 登录授权 · TSZ · …ed_oauth"
    })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", {
      name: "使用 OpenCode API Key · TSZ · …_key_one"
    })
  ).toBeDisabled();
});
