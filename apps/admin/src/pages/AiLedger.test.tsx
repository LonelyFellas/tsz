import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { beforeEach, expect, it, vi } from "vitest";
import type { AdminProfile, AiLedgerPage as Page } from "@tsz/types";
import { api, useAuthStore } from "@/lib/auth";
import { AiLedgerPage } from "./AiLedger";

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  const store = createAdminAuthStore();
  return {
    useAuthStore: store,
    useIsSuperAdmin: () => store((s) => s.profile?.role === "super_admin"),
    api: { aiLedger: { list: vi.fn() } }
  };
});
const profile: AdminProfile = {
  id: "super-test",
  phone: "test-phone",
  display_name: "超管",
  role: "super_admin",
  permission_version: 1,
  catalog_version: "v1",
  permissions: [],
  preferences: { dialect: "uk" }
};
const id = "0199bd15-8100-7000-8000-000000000001";
const payload: Page = {
  page: 1,
  page_size: 20,
  total: 21,
  summary: {
    observed_calls: 1,
    usage_observed_calls: 1,
    cache_observed_calls: 1,
    input_tokens: 50,
    output_tokens: 20,
    cache_hit_tokens: 0,
    cache_miss_tokens: 50,
    cache_hit_rate: 0,
    total_duration_ms: 1250,
    average_duration_ms: 1250
  },
  items: [
    {
      call_id: "call-1",
      run_id: id,
      external_request_id: id,
      model: "deepseek-flash",
      created_at: "2026-10-28T00:00:00Z",
      input_tokens: 50,
      output_tokens: 20,
      cost: null,
      metrics: {
        phase: "generate",
        outcome: "response",
        duration_ms: 1250,
        cache_hit_tokens: 0,
        cache_miss_tokens: 50
      }
    },
    {
      call_id: "call-2",
      run_id: id,
      external_request_id: id,
      model: "deepseek-flash",
      created_at: "2026-10-28T00:00:01Z",
      input_tokens: null,
      output_tokens: null,
      cost: null,
      metrics: null
    }
  ]
};
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.getState().setProfile(profile);
  vi.mocked(api.aiLedger.list).mockResolvedValue(payload);
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <ConfigProvider locale={zhCN}>
        <App>
          <AiLedgerPage />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
  return client;
}
it("普通管理员即使有词库权限也不挂载查询，超管降权后立即移除账本", async () => {
  useAuthStore.getState().setProfile({
    ...profile,
    role: "admin",
    permissions: ["words.access", "words.edit"]
  });
  mount();
  expect(screen.getByText("仅超级管理员可查看 AI 账本")).toBeInTheDocument();
  expect(api.aiLedger.list).not.toHaveBeenCalled();
  act(() => useAuthStore.getState().setProfile(profile));
  await screen.findByText("已响应");
  act(() => useAuthStore.getState().setProfile({ ...profile, role: "admin" }));
  expect(screen.queryByText("已响应")).not.toBeInTheDocument();
  expect(screen.getByText("仅超级管理员可查看 AI 账本")).toBeInTheDocument();
});
it("区分零命中和未知记录，分页及任务筛选使用服务端查询", async () => {
  mount();
  await screen.findByText("已响应");
  expect(screen.getAllByText("0.0%").length).toBeGreaterThan(0);
  expect(screen.getByText("未观测")).toBeInTheDocument();
  expect(screen.getByText("未知 / 未知")).toBeInTheDocument();
  expect(screen.getAllByText("1.25 秒").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByTitle("下一页"));
  await waitFor(() =>
    expect(api.aiLedger.list).toHaveBeenLastCalledWith(
      { page: 2, page_size: 20, run_id: undefined },
      { signal: expect.any(AbortSignal) }
    )
  );
  fireEvent.change(screen.getByLabelText("任务 ID"), {
    target: { value: "invalid" }
  });
  fireEvent.click(screen.getByRole("button", { name: "查 询" }));
  await screen.findByText("请输入完整的任务 UUID");
  expect(api.aiLedger.list).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText("任务 ID"), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: "查 询" }));
  await waitFor(() =>
    expect(api.aiLedger.list).toHaveBeenLastCalledWith(
      { page: 1, page_size: 20, run_id: id },
      { signal: expect.any(AbortSignal) }
    )
  );
});
it("刷新失败不展示旧账本或伪造空账本，可重试恢复", async () => {
  mount();
  await screen.findByText("已响应");
  vi.mocked(api.aiLedger.list).mockRejectedValueOnce(new Error("unavailable"));
  fireEvent.click(screen.getByRole("button", { name: /刷新/ }));
  await screen.findByText("AI 账本暂时不可用");
  expect(screen.queryByText("已响应")).not.toBeInTheDocument();
  expect(
    screen.queryByText("暂无符合条件的模型调用记录")
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /刷新/ }));
  await screen.findByText("已响应");
});
