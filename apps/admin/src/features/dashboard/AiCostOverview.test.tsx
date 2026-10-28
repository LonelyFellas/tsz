import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import type { AdminProfile, AiCostOverview as Overview } from "@tsz/types";
import { api, useAuthStore } from "@/lib/auth";
import { AiCostOverview } from "./AiCostOverview";

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: { aiLedger: { costOverview: vi.fn() } }
  };
});
const profile: AdminProfile = {
  id: "cost-admin",
  phone: "fixture",
  display_name: "costs",
  role: "super_admin",
  permission_version: 1,
  catalog_version: "v1",
  permissions: [],
  preferences: { dialect: "uk" }
};
const period = {
  start: null,
  end: "2026-10-28T04:00:00Z",
  estimated_cost_cny: "0.001392",
  total_calls: 3,
  priced_calls: 2,
  unknown_calls: 1
};
const data: Overview = {
  generated_at: period.end,
  timezone: "Asia/Shanghai",
  currency: "CNY",
  pricing_version: "test-price",
  pricing_valid_until: "2027-01-01",
  total: period,
  today: {
    ...period,
    total_calls: 1,
    priced_calls: 0,
    estimated_cost_cny: null
  },
  week: {
    ...period,
    total_calls: 0,
    priced_calls: 0,
    unknown_calls: 0,
    estimated_cost_cny: "0"
  },
  month: period
};
function mount() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <App>
          <AiCostOverview />
        </App>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.getState().setProfile(profile);
  vi.mocked(api.aiLedger.costOverview).mockResolvedValue(data);
});
it("普通管理员首页不请求费用；超管可见，降权后立即移除", async () => {
  useAuthStore
    .getState()
    .setProfile({ ...profile, role: "admin", permissions: ["words.access"] });
  mount();
  expect(api.aiLedger.costOverview).not.toHaveBeenCalled();
  expect(screen.queryByText("模型费用预估")).not.toBeInTheDocument();
  act(() => useAuthStore.getState().setProfile(profile));
  await screen.findByText("¥0.00");
  expect(screen.getByText("未知")).toBeInTheDocument();
  expect(screen.getAllByText("仅含已知部分")).toHaveLength(2);
  act(() => useAuthStore.getState().setProfile({ ...profile, role: "admin" }));
  expect(screen.queryByText("模型费用预估")).not.toBeInTheDocument();
});
it("费用接口失败显示不可用，不把旧金额当当前费用", async () => {
  mount();
  await screen.findByText("¥0.00");
  vi.mocked(api.aiLedger.costOverview).mockRejectedValueOnce(
    new Error("unavailable")
  );
  fireEvent.click(screen.getByRole("button", { name: "刷新模型费用" }));
  await screen.findByText("模型费用暂时不可用");
  expect(screen.queryByText("¥0.00")).not.toBeInTheDocument();
});
