import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  OpenCodeModelSelection,
  OpenCodeModelProbeReport
} from "@tsz/types";
import { api } from "@/lib/auth";
import { OpenCodeModels } from "./OpenCodeModels";

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
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <ConfigProvider>
      <App>
        <QueryClientProvider client={client}>
          <OpenCodeModels adminId="super-test" configured />
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
  return client;
}
async function chooseModel() {
  await screen.findByText("当前出题模型：deepseek / deepseek-flash（直连）");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(
    await screen.findByText(/test-provider \/ Paid model \(paid-model\)/)
  );
}
it("展示当前模型，切换后独立重读服务端持久化结果", async () => {
  mount();
  await chooseModel();
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
  vi.mocked(api.opencode.currentModel).mockResolvedValue(target);
  fireEvent.click(screen.getByRole("button", { name: "保存模型" }));
  await screen.findByText(
    "当前出题模型：test-provider / paid-model（OpenCode）"
  );
  expect(api.opencode.selectModel).toHaveBeenCalledExactlyOnceWith(target);
  expect(api.opencode.currentModel).toHaveBeenCalledTimes(2);
});
it("切换失败保留原模型和选择，列表失败允许刷新", async () => {
  vi.mocked(api.opencode.selectModel).mockRejectedValue(
    new Error("unavailable")
  );
  mount();
  await chooseModel();
  fireEvent.click(screen.getByRole("button", { name: "保存模型" }));
  await screen.findByText("模型保存失败，请刷新并确认所选模型已通过探针。");
  expect(
    screen.getByText("当前出题模型：deepseek / deepseek-flash（直连）")
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "保存模型" })).toBeEnabled();
  vi.mocked(api.opencode.probeReport).mockRejectedValueOnce(
    new Error("unavailable")
  );
  fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
  await screen.findByText("无法获取模型及探针结果，请刷新模型重试。");
});
it("添加 Key 后清空输入并刷新目录，不把密钥放进 mutation 变量或自动切换", async () => {
  const client = mount();
  await screen.findByText("当前出题模型：deepseek / deepseek-flash（直连）");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "模型服务商" }));
  fireEvent.click(await screen.findByText("Test provider"));
  fireEvent.change(screen.getByLabelText("API Key"), {
    target: { value: "synthetic-test-key" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存 API Key" }));
  await screen.findByText("API Key 已保存，请从模型列表中选择要使用的模型。");
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
it("当前模型未知时禁止保存，不能将旧缓存当成当前模型", async () => {
  vi.mocked(api.opencode.currentModel).mockRejectedValue(
    new Error("unavailable")
  );
  mount();
  await screen.findByText("无法读取当前出题模型，请刷新模型重试。");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存模型" })).toBeDisabled()
  );
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
});

it("加载全部模型但拒绝选择未验证项，探测全部只运行一次并保留当前模型", async () => {
  const pending = report();
  pending.state = "idle";
  pending.batch_id = null;
  pending.models = pending.models.map((m) => ({ ...m, status: "unverified" }));
  vi.mocked(api.opencode.probeReport).mockResolvedValue(pending);
  mount();
  await screen.findByText("当前出题模型：deepseek / deepseek-flash（直连）");
  expect(api.opencode.probeAll).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(
    await screen.findByText(/待探测 · test-provider \/ Paid model/)
  );
  expect(screen.getByRole("button", { name: "保存模型" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /探测全部/ }));
  await waitFor(() => expect(api.opencode.probeAll).toHaveBeenCalledTimes(1));
  await screen.findByText("通过 2");
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
  expect(
    screen.getByText("当前出题模型：deepseek / deepseek-flash（直连）")
  ).toBeVisible();
});

it("目录 enabled 为 true 但探针失败的模型保持禁选", async () => {
  const failed = report();
  failed.models = failed.models.map((m) =>
    m.model_id === "paid-model"
      ? {
          ...m,
          status: "unavailable",
          http_status: 503,
          error: "request_failed"
        }
      : m
  );
  vi.mocked(api.opencode.probeReport).mockResolvedValue(failed);
  mount();
  await screen.findByText("当前出题模型：deepseek / deepseek-flash（直连）");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "出题模型" }));
  fireEvent.click(
    await screen.findByText(/不可用（HTTP 503） · test-provider \/ Paid model/)
  );
  expect(screen.getByRole("button", { name: "保存模型" })).toBeDisabled();
  expect(api.opencode.selectModel).not.toHaveBeenCalled();
});

it("较早的目录请求返回后仍保留新探针批次并继续轮询", async () => {
  let resolveOld!: (value: OpenCodeModelProbeReport) => void;
  const oldRequest = new Promise<OpenCodeModelProbeReport>((resolve) => {
    resolveOld = resolve;
  });
  const next = report();
  next.batch_id = "00000000-0000-0000-0000-000000000002";
  next.state = "running";
  next.models = next.models.map((m) => ({ ...m, status: "unverified" }));
  vi.mocked(api.opencode.probeReport)
    .mockResolvedValueOnce(report())
    .mockReturnValueOnce(oldRequest)
    .mockResolvedValue(next);
  vi.mocked(api.opencode.probeAll).mockResolvedValue(next);
  const client = mount();
  await screen.findByText("通过 2");
  fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
  await waitFor(() =>
    expect(api.opencode.probeReport).toHaveBeenCalledTimes(2)
  );
  fireEvent.click(screen.getByRole("button", { name: /探测全部/ }));
  await screen.findByRole("button", { name: /探测中/ });
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
  expect(screen.getByRole("button", { name: /探测中/ })).toBeVisible();
});
