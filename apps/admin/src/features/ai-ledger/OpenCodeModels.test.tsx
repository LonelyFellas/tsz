import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App } from "@tsz/ui/admin/overlays";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  OpenCodeModelSelection,
  OpenCodeModelProbeReport
} from "@tsz/types";
import { api } from "@/lib/auth";
import { OpenCodeModels } from "./OpenCodeModels";
import { OpenCodeKeyForm } from "./OpenCodeKeyForm";

vi.mock("@/lib/auth", () => ({
  api: {
    opencode: {
      probeReport: vi.fn(),
      probeAll: vi.fn(),
      providers: vi.fn(),
      currentModel: vi.fn(),
      selectModel: vi.fn(),
      connectKey: vi.fn()
    }
  }
}));
const direct: OpenCodeModelSelection = {
  source: "direct",
  provider_id: "deepseek",
  model_id: "deepseek-flash"
};
const target: OpenCodeModelSelection = {
  source: "opencode",
  provider_id: "test-provider",
  model_id: "paid-model"
};
function report(): OpenCodeModelProbeReport {
  return {
    state: "completed",
    batch_id: "00000000-0000-0000-0000-000000000001",
    models: [
      {
        ...direct,
        name: "deepseek-flash（直连）",
        enabled: true,
        status: "available",
        cost: null
      },
      {
        ...target,
        name: "Paid model",
        enabled: true,
        status: "available",
        cost: null
      },
      {
        source: "opencode",
        provider_id: "test-provider",
        model_id: "disabled",
        name: "Disabled",
        enabled: false,
        status: "unavailable",
        error: "disabled",
        cost: null
      }
    ]
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.opencode.currentModel).mockResolvedValue(direct);
  vi.mocked(api.opencode.probeReport).mockResolvedValue(report());
  vi.mocked(api.opencode.probeAll).mockResolvedValue(report());
  vi.mocked(api.opencode.providers).mockResolvedValue({
    providers: [
      { id: "test-provider", name: "Test provider", connected: false }
    ]
  });
  vi.mocked(api.opencode.selectModel).mockResolvedValue(target);
  vi.mocked(api.opencode.connectKey).mockResolvedValue(undefined);
});
function mount(withKey = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <App>
      <QueryClientProvider client={client}>
        <OpenCodeModels adminId="super-test" />
        {withKey && <OpenCodeKeyForm adminId="super-test" />}
      </QueryClientProvider>
    </App>
  );
  return client;
}
async function ready(name = "deepseek-flash") {
  const region = await screen.findByRole("region", { name: "当前出题模型" });
  await within(region).findByText(name);
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "出题模型" })).toBeEnabled()
  );
  return region;
}
async function chooseModel() {
  await ready();
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(await screen.findByText("Paid model（test-provider）"));
}
it("模型保存后独立重读服务端结果", async () => {
  mount();
  await chooseModel();
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
  vi.mocked(api.opencode.currentModel).mockResolvedValue(target);
  fireEvent.click(screen.getByRole("button", { name: "保存模型" }));
  await ready("Paid model");
  expect(api.opencode.selectModel).toHaveBeenCalledExactlyOnceWith(target);
  expect(api.opencode.currentModel).toHaveBeenCalledTimes(2);
});
it("ChatGPT 使用相同可用性限制，保存后重读并保留用量入口", async () => {
  const chatgpt: OpenCodeModelSelection = {
    source: "chatgpt",
    provider_id: "oaiapp_fixture",
    model_id: "fixture-model"
  };
  vi.mocked(api.opencode.probeReport).mockResolvedValue({
    state: "completed",
    models: [
      {
        ...chatgpt,
        name: "ChatGPT fixture（ChatGPT）",
        enabled: true,
        status: "available",
        cost: null
      }
    ]
  });
  vi.mocked(api.opencode.selectModel).mockResolvedValue(chatgpt);
  mount();
  await ready("deepseek-flash");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(await screen.findByText("ChatGPT fixture（ChatGPT）"));
  vi.mocked(api.opencode.currentModel).mockResolvedValue(chatgpt);
  fireEvent.click(screen.getByRole("button", { name: "保存模型" }));
  await ready("ChatGPT fixture");
  expect(api.opencode.selectModel).toHaveBeenCalledExactlyOnceWith(chatgpt);
  expect(api.opencode.currentModel).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole("link", { name: "管理 ChatGPT 用量" })
  ).toHaveAttribute("href", "https://chatgpt.com/settings/usage");
});
it("保存失败保留当前模型和选择，目录失败可刷新", async () => {
  vi.mocked(api.opencode.selectModel).mockRejectedValue(
    new Error("unavailable")
  );
  mount();
  await chooseModel();
  fireEvent.click(screen.getByRole("button", { name: "保存模型" }));
  await screen.findByText("模型保存失败，请刷新后重试。");
  expect(within(await ready()).getByText("deepseek-flash")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存模型" })).toBeEnabled();
  vi.mocked(api.opencode.probeReport).mockRejectedValueOnce(
    new Error("unavailable")
  );
  fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
  await screen.findByText("模型列表读取失败，请刷新。");
});
it("Key 表单保存后清空输入并刷新目录，不把密钥放入 mutation 变量或自动切换", async () => {
  const client = mount(true);
  await ready();
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "模型服务商" }));
  fireEvent.click(await screen.findByText("Test provider"));
  fireEvent.change(screen.getByLabelText("API Key"), {
    target: { value: "synthetic-test-key" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存 API Key" }));
  await screen.findByText("API Key 已保存。");
  expect(api.opencode.connectKey).toHaveBeenCalledExactlyOnceWith({
    provider_id: "test-provider",
    api_key: "synthetic-test-key"
  });
  expect(screen.getByLabelText("API Key")).toHaveValue("");
  expect(api.opencode.probeReport).toHaveBeenCalledTimes(2);
  expect(api.opencode.providers).toHaveBeenCalledTimes(2);
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
  expect(
    client
      .getMutationCache()
      .getAll()
      .every((m) => m.state.variables === undefined)
  ).toBe(true);
});
it("当前模型未知时不能保存", async () => {
  vi.mocked(api.opencode.currentModel).mockRejectedValue(
    new Error("unavailable")
  );
  mount();
  await screen.findByText("当前模型读取失败，请刷新。");
  expect(screen.getByRole("button", { name: "保存模型" })).toBeDisabled();
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
});
it("未经测试的模型不可选，测试仅由明确点击触发", async () => {
  const pending = report();
  pending.state = "idle";
  pending.batch_id = null;
  pending.models = pending.models.map((model) => ({
    ...model,
    status: "unverified"
  }));
  vi.mocked(api.opencode.probeReport).mockResolvedValue(pending);
  mount();
  await ready();
  expect(api.opencode.probeAll).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(await screen.findByText("Paid model（test-provider）"));
  expect(screen.getByRole("button", { name: "保存模型" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "测试模型" }));
  await waitFor(() => expect(api.opencode.probeAll).toHaveBeenCalledTimes(1));
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
  expect(within(await ready()).getByText("deepseek-flash")).toBeVisible();
});
it("enabled 为 true 但测试失败的模型保持禁选", async () => {
  const failed = report();
  failed.models = failed.models.map((model) =>
    model.model_id === "paid-model"
      ? {
          ...model,
          status: "unavailable",
          http_status: 503,
          error: "request_failed"
        }
      : model
  );
  vi.mocked(api.opencode.probeReport).mockResolvedValue(failed);
  mount();
  await ready();
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(await screen.findByText("Paid model（test-provider）"));
  expect(screen.getByRole("button", { name: "保存模型" })).toBeDisabled();
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
});
it("早发目录请求不能覆盖新测试批次，运行中继续轮询", async () => {
  let resolveOld!: (value: OpenCodeModelProbeReport) => void;
  const oldRequest = new Promise<OpenCodeModelProbeReport>((resolve) => {
    resolveOld = resolve;
  });
  const next = report();
  next.batch_id = "00000000-0000-0000-0000-000000000002";
  next.state = "running";
  next.models = next.models.map((model) => ({
    ...model,
    status: "unverified"
  }));
  vi.mocked(api.opencode.probeReport)
    .mockResolvedValueOnce(report())
    .mockReturnValueOnce(oldRequest)
    .mockResolvedValue(next);
  vi.mocked(api.opencode.probeAll).mockResolvedValue(next);
  const client = mount();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
  await waitFor(() =>
    expect(api.opencode.probeReport).toHaveBeenCalledTimes(2)
  );
  fireEvent.click(screen.getByRole("button", { name: "测试模型" }));
  await screen.findByRole("button", { name: /测试中/ });
  await act(async () => {
    resolveOld(report());
    await oldRequest;
  });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(
    client.getQueryData<OpenCodeModelProbeReport>([
      "opencode-model-probes",
      "super-test"
    ])?.batch_id
  ).toBe(next.batch_id);
  expect(screen.getByRole("button", { name: /测试中/ })).toBeVisible();
});

it("同名模型按 ID 区分并可按 ID 搜索和保存", async () => {
  const first = {
    ...report().models[1]!,
    name: "Shared name",
    model_id: "model-one"
  };
  const second = { ...first, model_id: "model-two" };
  vi.mocked(api.opencode.probeReport).mockResolvedValue({
    ...report(),
    models: [report().models[0]!, first, second]
  });
  mount();
  await ready();
  const picker = screen.getByRole("combobox", { name: "出题模型" });
  fireEvent.mouseDown(picker);
  await screen.findByText("Shared name（test-provider） / model-one");
  fireEvent.change(picker, { target: { value: "model-two" } });
  const option = await screen.findByText(
    "Shared name（test-provider） / model-two"
  );
  expect(
    screen.queryByText("Shared name（test-provider） / model-one")
  ).not.toBeInTheDocument();
  fireEvent.click(option);
  vi.mocked(api.opencode.currentModel).mockResolvedValue(second);
  fireEvent.click(screen.getByRole("button", { name: "保存模型" }));
  await ready("Shared name");
  expect(api.opencode.selectModel).toHaveBeenCalledExactlyOnceWith({
    source: second.source,
    provider_id: second.provider_id,
    model_id: second.model_id
  });
});

it("模型从目录消失时不将其诊断为账号退出", async () => {
  vi.mocked(api.opencode.currentModel).mockResolvedValue(target);
  vi.mocked(api.opencode.probeReport).mockResolvedValue({
    ...report(),
    models: []
  });
  mount();
  await ready("paid-model");
  expect(
    screen.queryByText("当前模型的账号未连接，请到模型账号检查。")
  ).not.toBeInTheDocument();
  expect(screen.getByText("当前模型不可用，请重新测试或选择。")).toBeVisible();
});
