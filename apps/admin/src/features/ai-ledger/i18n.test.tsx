import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "@tsz/ui/admin/overlays";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { type InterfaceLocale, createInterfaceI18n } from "@tsz/shared/i18n";
import { createAdminI18n } from "@/i18n";
import { api, useAuthStore } from "@/lib/auth";
import { ChatGPTConnection } from "./ChatGPTConnection";
import { OpenCodeConnection } from "./OpenCodeConnection";
import { OpenCodeModels } from "./OpenCodeModels";
import { OpenCodeKeyForm } from "./OpenCodeKeyForm";
import { OpenCodeProviders } from "./OpenCodeProviders";
import { AiLedgerPage } from "@/pages/AiLedger";
import { aiResources } from "./i18n";
import type { ReactNode } from "react";

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  const store = createAdminAuthStore();
  return {
    useAuthStore: store,
    useIsSuperAdmin: () => store((s) => s.profile?.role === "super_admin"),
    api: {
      chatgpt: {
        setup: vi.fn(),
        accounts: vi.fn(),
        login: vi.fn(),
        loginStatus: vi.fn(),
        cancelLogin: vi.fn(),
        useAccount: vi.fn(),
        logout: vi.fn()
      },
      opencode: {
        connection: vi.fn(),
        login: vi.fn(),
        loginStatus: vi.fn(),
        cancelLogin: vi.fn(),
        providers: vi.fn(),
        connectKey: vi.fn(),
        connectedProviders: vi.fn(),
        activateConnection: vi.fn(),
        disconnectConnection: vi.fn(),
        currentModel: vi.fn(),
        probeReport: vi.fn(),
        probeAll: vi.fn(),
        selectModel: vi.fn()
      },
      aiLedger: { costs: vi.fn() }
    }
  };
});
const pending = {
  attempt_id: "00000000-0000-0000-0000-000000000011",
  authorization_url:
    "https://example.test/authorise?state=raw_state&code_challenge=raw_challenge",
  expires_at: "2099-01-01T12:34:00Z"
};
const selected = {
  source: "opencode" as const,
  provider_id: "raw-provider",
  model_id: "raw-model"
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.chatgpt.setup).mockResolvedValue({ login_method: "local" });
  vi.mocked(api.chatgpt.accounts).mockResolvedValue({
    configured: true,
    active: null,
    accounts: [],
    pending_login: pending
  });
  vi.mocked(api.chatgpt.loginStatus).mockResolvedValue({
    status: "pending",
    error: null,
    expires_at: pending.expires_at
  });
  vi.mocked(api.opencode.connection).mockResolvedValue({
    configured: true,
    connected: false,
    login_available: true
  });
  vi.mocked(api.opencode.login).mockResolvedValue(pending);
  vi.mocked(api.opencode.loginStatus).mockResolvedValue({
    status: "pending",
    expires_at: pending.expires_at
  });
  vi.mocked(api.opencode.providers).mockResolvedValue({
    providers: [{ id: "raw-provider", name: "原始 Provider", connected: false }]
  });
  vi.mocked(api.opencode.connectedProviders).mockResolvedValue({
    providers: [
      {
        id: "raw-provider",
        name: "原始 Provider",
        connections: [
          {
            id: "connection-raw-001",
            method: "key",
            label: "原始 label",
            active: false
          }
        ]
      }
    ]
  });
  vi.mocked(api.opencode.currentModel).mockResolvedValue({
    source: "direct",
    provider_id: "deepseek",
    model_id: "original-model"
  });
  vi.mocked(api.opencode.probeReport).mockResolvedValue({
    state: "completed",
    batch_id: "batch-raw",
    models: [
      {
        ...selected,
        name: "原始 model",
        enabled: true,
        status: "available",
        cost: null
      }
    ]
  });
  useAuthStore.getState().setProfile({
    id: "fixture-admin",
    phone: "fixture",
    display_name: "原管理员",
    role: "super_admin",
    permission_version: 1,
    catalog_version: "v1",
    permissions: [],
    preferences: { dialect: "uk" }
  });
});
function mount(children: ReactNode, initial: InterfaceLocale = "zh-Hans") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <App>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </App>
    </InterfaceI18nProvider>
  );
  const view = render(content(initial));
  return {
    switchTo: (locale: InterfaceLocale) => view.rerender(content(locale))
  };
}
it("四语资源按需加载，完整短语保留插值及精确计数", () => {
  expect(createAdminI18n().hasResourceBundle("zh-Hans", "adminAi")).toBe(false);
  for (const locale of ["zh-Hans", "zh-Hant", "en-GB", "en-US"] as const) {
    const instance = createInterfaceI18n(locale, aiResources);
    const t = (
      key: "link_expiry" | "use_credential_label" | "total_calls",
      values = {}
    ) => instance.t(key, { ns: "adminAi", ...values });
    expect(t("link_expiry", { time: "12:34:00" })).toContain("12:34:00");
    expect(
      t("use_credential_label", {
        provider: "raw/provider",
        name: "原始 label"
      })
    ).toContain("原始 label");
    expect(t("total_calls", { count: 1 })).not.toContain("total_calls");
    if (locale.startsWith("en")) {
      expect(t("total_calls", { count: 1 })).toBe("1 call in total");
      expect(t("total_calls", { count: 2 })).toBe("2 calls in total");
    }
  }
});
it("ChatGPT 与 OpenCode 授权在途切换只更新显示，保留链接、抽屉与 attempt", async () => {
  const view = mount(
    <>
      <ChatGPTConnection adminId="fixture-admin" />
      <OpenCodeConnection adminId="fixture-admin" />
    </>
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "继续登录 ChatGPT" })
  );
  const originalLink = await screen.findByRole("link", {
    name: "前往 ChatGPT 授权"
  });
  fireEvent.click(screen.getByRole("button", { name: "连接 OpenCode" }));
  fireEvent.click(screen.getByRole("button", { name: "登录授权" }));
  await screen.findByRole("link", { name: "前往 OpenCode 登录" });
  const counts = [
    vi.mocked(api.chatgpt.accounts).mock.calls.length,
    vi.mocked(api.opencode.connection).mock.calls.length
  ];
  for (const locale of ["en-GB", "zh-Hant", "en-US"] as const)
    view.switchTo(locale);
  expect(screen.getByRole("link", { name: "Authorise with ChatGPT" })).toBe(
    originalLink
  );
  expect(originalLink).toHaveAttribute("href", pending.authorization_url);
  expect(
    screen.getByRole("link", { name: "Sign in to OpenCode" })
  ).toHaveAttribute("href", pending.authorization_url);
  expect(screen.getAllByRole("dialog")).toHaveLength(2);
  expect([
    vi.mocked(api.chatgpt.accounts).mock.calls.length,
    vi.mocked(api.opencode.connection).mock.calls.length
  ]).toEqual(counts);
  expect(api.chatgpt.login).not.toHaveBeenCalled();
  expect(api.opencode.login).toHaveBeenCalledTimes(1);
  expect(api.chatgpt.cancelLogin).not.toHaveBeenCalled();
  expect(api.opencode.cancelLogin).not.toHaveBeenCalled();
  expect(api.chatgpt.loginStatus).toHaveBeenCalledWith(pending.attempt_id, {
    signal: expect.any(AbortSignal)
  });
});
it("密钥输入、焦点与已显示校验切换保留，提交仍为原 provider/key，pending 不重发", async () => {
  let finish!: () => void;
  vi.mocked(api.opencode.connectKey).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      })
  );
  const view = mount(<OpenCodeKeyForm adminId="fixture-admin" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存 API Key" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "保存 API Key" }));
  await screen.findByText("请输入 API Key");
  view.switchTo("en-US");
  expect(screen.getByText("Enter an API Key")).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(await screen.findByText("原始 Provider"));
  const key = screen.getByPlaceholderText("Paste API Key");
  fireEvent.change(key, { target: { value: "fixture-secret-原文-001" } });
  key.focus();
  view.switchTo("zh-Hant");
  expect(key).toHaveFocus();
  expect(key).toHaveValue("fixture-secret-原文-001");
  expect(api.opencode.connectKey).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "儲存 API Key" }));
  await waitFor(() =>
    expect(api.opencode.connectKey).toHaveBeenCalledWith({
      provider_id: "raw-provider",
      api_key: "fixture-secret-原文-001"
    })
  );
  view.switchTo("en-GB");
  expect(api.opencode.connectKey).toHaveBeenCalledTimes(1);
  expect(key).toHaveValue("fixture-secret-原文-001");
  finish();
  await waitFor(() => expect(key).toHaveValue(""));
});
it("模型草稿/展开与供应商确认跨语言保留，显式提交使用原始业务身份", async () => {
  vi.mocked(api.opencode.selectModel).mockRejectedValue(
    new Error("raw backend error")
  );
  vi.mocked(api.opencode.activateConnection).mockResolvedValue(undefined);
  const view = mount(
    <>
      <OpenCodeModels adminId="fixture-admin" />
      <OpenCodeProviders adminId="fixture-admin" disabled={false} />
    </>
  );
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "出题模型" })).toBeEnabled()
  );
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(await screen.findByText("原始 model（raw-provider）"));
  const details = screen.getByText("查看测试结果（1）").closest("details")!;
  details.open = true;
  fireEvent.click(screen.getByRole("button", { name: /使用 原始 Provider/ }));
  await screen.findByText("切换到这份凭据？");
  view.switchTo("en-US");
  expect(screen.getByText("Switch to this credential?")).toBeInTheDocument();
  expect(details.open).toBe(true);
  expect(
    screen
      .getByRole("combobox", { name: "Question model" })
      .closest(".ui-select")
  ).toHaveTextContent("原始 model（raw-provider）");
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
  expect(api.opencode.probeAll).not.toHaveBeenCalled();
  expect(api.opencode.activateConnection).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm switch" }));
  await waitFor(() =>
    expect(api.opencode.activateConnection).toHaveBeenCalledWith(
      "raw-provider",
      "connection-raw-001"
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Save model" }));
  await screen.findByText("Could not save the model. Refresh and try again.");
  expect(api.opencode.selectModel).toHaveBeenCalledWith(selected);
  view.switchTo("zh-Hant");
  expect(
    screen.getByText("模型儲存失敗，請重新整理後再試。")
  ).toBeInTheDocument();
  expect(api.opencode.selectModel).toHaveBeenCalledTimes(1);
});
it("账单分页、未提交筛选、展开行和精确金额在切换后保留，校验即时翻译", async () => {
  vi.mocked(api.aiLedger.costs).mockResolvedValue({
    ledger: {
      page: 1,
      page_size: 20,
      total: 21,
      summary: {
        observed_calls: 1,
        usage_observed_calls: 1,
        cache_observed_calls: 1,
        input_tokens: 0,
        output_tokens: 0,
        cache_hit_tokens: 0,
        cache_miss_tokens: 0,
        cache_hit_rate: null,
        total_duration_ms: 0,
        average_duration_ms: 0
      },
      items: [
        {
          call_id: "call-raw",
          model: "model-原文",
          run_id: null,
          external_request_id: null,
          created_at: "2026-11-08T00:00:00Z",
          input_tokens: null,
          output_tokens: null,
          cost: null,
          metrics: null
        }
      ]
    },
    costs: [
      {
        call_id: "call-raw",
        estimated_cost_cny: "9007199254740993.123456",
        pricing: null
      }
    ],
    cost_summary: {
      estimated_cost_cny: "9007199254740993.123456",
      total_calls: 21,
      priced_calls: 1,
      unknown_calls: 20
    }
  });
  const view = mount(<AiLedgerPage />);
  await screen.findByText("model-原文");
  fireEvent.click(screen.getByTitle("下一页"));
  await waitFor(() =>
    expect(api.aiLedger.costs).toHaveBeenLastCalledWith(
      { page: 2, page_size: 20, run_id: undefined, purpose: undefined },
      { signal: expect.any(AbortSignal) }
    )
  );
  fireEvent.click(await screen.findByRole("button", { name: "展开行" }));
  await screen.findByText("call-raw");
  const input = screen.getByLabelText("任务 ID");
  fireEvent.change(input, { target: { value: "raw-invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  await screen.findByText("请输入完整的任务 UUID");
  const before = vi.mocked(api.aiLedger.costs).mock.calls.length;
  input.focus();
  view.switchTo("en-GB");
  expect(screen.getByText("Enter the full task UUID")).toBeInTheDocument();
  expect(input).toHaveFocus();
  expect(input).toHaveValue("raw-invalid");
  expect(screen.getByText("call-raw")).toBeInTheDocument();
  expect(
    screen.getAllByText("¥9,007,199,254,740,993.123456").length
  ).toBeGreaterThan(0);
  expect(screen.getAllByText("Unknown / Unknown").length).toBeGreaterThan(0);
  expect(api.aiLedger.costs).toHaveBeenCalledTimes(before);
});
