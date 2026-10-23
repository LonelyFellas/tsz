import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { useAuthStore } from "@/lib/auth";
import { CoinsPage } from "./Coins";
vi.mock("@/lib/env", () => ({ env: { API_BASE_URL: "/api/v1" } }));
vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: {
      coinManagement: {
        accounts: vi.fn(),
        entries: vi.fn(),
        operations: vi.fn(),
        credit: vi.fn(),
        reverse: vi.fn()
      }
    }
  };
});
import { api } from "@/lib/auth";
const profile = {
  id: "admin1",
  phone: "13800000001",
  display_name: "operator",
  role: "admin" as const,
  permission_version: 1,
  catalog_version: "v1",
  permissions: ["coins.access", "coins.credit", "coins.reverse"],
  preferences: { dialect: "uk" as const }
};
const pagination = { page: 1, page_size: 20, total: 1, total_pages: 1 };
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.getState().setProfile(profile);
  vi.mocked(api.coinManagement.accounts).mockResolvedValue({
    items: [
      {
        owner_type: "user",
        owner_id: "user1",
        display_name: "收款人",
        account_status: "active",
        status: "open",
        balance: "0"
      }
    ],
    pagination
  });
  vi.mocked(api.coinManagement.entries).mockResolvedValue({
    items: [],
    snapshot: "0",
    pagination: { ...pagination, total: 0 }
  });
  vi.mocked(api.coinManagement.operations).mockResolvedValue({
    items: [],
    pagination: { ...pagination, total: 0 }
  });
});
function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <CoinsPage />
      </App>
    </QueryClientProvider>
  );
}
async function prepare() {
  fireEvent.change(
    screen.getByPlaceholderText("姓名 / 账号编号 / 完整手机号或邮箱"),
    { target: { value: "user1" } }
  );
  fireEvent.click(screen.getByText("查找"));
  fireEvent.click(await screen.findByText("查看账户"));
  fireEvent.change(screen.getByLabelText("天生币数量"), {
    target: { value: "9007199254740993" }
  });
  fireEvent.change(screen.getByLabelText("业务单号"), {
    target: { value: "invoice1" }
  });
  fireEvent.change(screen.getByLabelText("发放原因"), {
    target: { value: "verified" }
  });
  fireEvent.click(screen.getByText("核对并发放"));
  await screen.findByText("确认发放天生币");
}
it("confirmation shows exact target and amount; timeout and unrelated grants preserve the request key", async () => {
  vi.mocked(api.coinManagement.credit).mockRejectedValue(
    new HttpError(504, "gateway timeout")
  );
  open();
  await prepare();
  expect(screen.getByText("9,007,199,254,740,993 天生币")).toBeInTheDocument();
  fireEvent.click(screen.getByText("确认发放"));
  await screen.findByText(/暂时无法确认操作结果/);
  const first = vi.mocked(api.coinManagement.credit).mock.calls[0]![0];
  expect(first.owner_id).toBe("user1");
  expect(first.amount).toBe("9007199254740993");
  act(() =>
    useAuthStore.getState().setProfile({
      ...profile,
      permission_version: 2,
      permissions: [...profile.permissions, "users.access"]
    })
  );
  fireEvent.click(screen.getByText("确认发放"));
  await waitFor(() =>
    expect(api.coinManagement.credit).toHaveBeenCalledTimes(2)
  );
  expect(vi.mocked(api.coinManagement.credit).mock.calls[1]![0]).toEqual(first);
  act(() =>
    useAuthStore.getState().setProfile({
      ...profile,
      permission_version: 3,
      permissions: ["coins.access"]
    })
  );
  expect(screen.queryByText("确认发放天生币")).not.toBeInTheDocument();
});
it("query-only admin cannot credit and loss of access removes private data", async () => {
  useAuthStore
    .getState()
    .setProfile({ ...profile, permissions: ["coins.access"] });
  open();
  fireEvent.change(
    screen.getByPlaceholderText("姓名 / 账号编号 / 完整手机号或邮箱"),
    { target: { value: "user1" } }
  );
  fireEvent.click(screen.getByText("查找"));
  fireEvent.click(await screen.findByText("查看账户"));
  expect(screen.queryByText("核对并发放")).not.toBeInTheDocument();
  act(() =>
    useAuthStore.getState().setProfile({ ...profile, permissions: [] })
  );
  expect(screen.queryByText("收款人")).not.toBeInTheDocument();
  expect(screen.getByText("没有天生币管理查询权限")).toBeInTheDocument();
});
const operation = {
  id: "operation1",
  owner_type: "user" as const,
  owner_id: "user1",
  owner_display_name: "张小明",
  actor_id: "admin1",
  actor_display_name: "王老师",
  source_type: "manual_reward",
  event_id: "reward-2026",
  delta: "3",
  balance_after: "8",
  reason: "活动奖励",
  evidence_ref: "内部凭据",
  created_at: "2026-10-23T08:00:00Z"
};
it("names lead to private details and reversal retries preserve the exact intent", async () => {
  vi.mocked(api.coinManagement.operations).mockResolvedValue({
    items: [operation],
    pagination
  });
  vi.mocked(api.coinManagement.reverse).mockRejectedValue(
    new HttpError(504, "timeout")
  );
  open();
  fireEvent.click(
    screen.getByText("发放记录", { selector: ".ant-tabs-tab-btn" })
  );
  await screen.findByText("张小明");
  expect(screen.getByText("王老师")).toBeInTheDocument();
  expect(screen.queryByText("内部凭据")).not.toBeInTheDocument();
  expect(
    screen.queryByText("撤销发放", { selector: "button span" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("查看详情"));
  const drawer = screen.getByRole("dialog", { hidden: true });
  expect(within(drawer).getByText("内部凭据")).toBeInTheDocument();
  fireEvent.click(
    within(drawer).getByText("撤销发放", { selector: "button span" })
  );
  const modal = (await screen.findByText("确认撤销发放")).closest(
    "[role=dialog]"
  ) as HTMLElement;
  expect(within(modal).getByText("张小明")).toBeInTheDocument();
  expect(within(modal).getByText("3 天生币")).toBeInTheDocument();
  const confirm = within(modal).getByText("确认扣回").closest("button")!;
  expect(confirm).toBeDisabled();
  fireEvent.change(within(modal).getByLabelText("撤销原因"), {
    target: { value: "发错数量" }
  });
  fireEvent.click(confirm);
  await within(modal).findByText(/暂时无法确认操作结果/);
  const first = vi.mocked(api.coinManagement.reverse).mock.calls[0];
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(api.coinManagement.reverse).toHaveBeenCalledTimes(2)
  );
  expect(vi.mocked(api.coinManagement.reverse).mock.calls[1]).toEqual(first);
  expect(first).toEqual([
    operation.id,
    { reason: "发错数量", idempotency_key: expect.any(String) }
  ]);
});
it("name filters and reset clear both visible and collapsed conditions", async () => {
  open();
  fireEvent.click(
    screen.getByText("发放记录", { selector: ".ant-tabs-tab-btn" })
  );
  fireEvent.change(screen.getByPlaceholderText("输入姓名或账号编号"), {
    target: { value: " 张小明 " }
  });
  fireEvent.click(screen.getByText("更多筛选"));
  fireEvent.change(screen.getByPlaceholderText("输入姓名或操作人编号"), {
    target: { value: " 王老师 " }
  });
  fireEvent.click(screen.getByText("收起筛选"));
  fireEvent.click(screen.getByText(/^查\s*询$/, { selector: "button span" }));
  await waitFor(() =>
    expect(api.coinManagement.operations).toHaveBeenLastCalledWith(
      expect.objectContaining({
        owner_search: "张小明",
        actor_search: "王老师",
        include_names: true
      }),
      expect.anything()
    )
  );
  fireEvent.click(
    screen.getByRole("button", { name: /^重\s*置$/, hidden: true })
  );
  await waitFor(() =>
    expect(api.coinManagement.operations).toHaveBeenLastCalledWith(
      { page_size: 20, include_names: true },
      expect.anything()
    )
  );
});
it.each([
  { ...operation, reversed_by_operation_id: "reversal1" },
  {
    ...operation,
    id: "reversal1",
    reverses_operation_id: "operation1",
    delta: "-3"
  }
])("completed and reversal records cannot be reversed again", async (row) => {
  vi.mocked(api.coinManagement.operations).mockResolvedValue({
    items: [row],
    pagination
  });
  open();
  fireEvent.click(
    screen.getByText("发放记录", { selector: ".ant-tabs-tab-btn" })
  );
  fireEvent.click(await screen.findByText("查看详情"));
  expect(
    within(screen.getByRole("dialog", { hidden: true })).queryByRole("button", {
      name: "撤销发放",
      hidden: true
    })
  ).not.toBeInTheDocument();
});
it("manual operation filters exclude automatic rewards and submit supported source types", async () => {
  open();
  fireEvent.click(screen.getByText("发放记录"));
  fireEvent.mouseDown(screen.getByLabelText("类型"));
  await screen.findByText("手动奖励");
  expect(screen.queryByText("邀请奖励")).not.toBeInTheDocument();
  expect(screen.queryByText("注销余额作废")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("手动奖励"));
  fireEvent.click(screen.getByText(/^查\s*询$/, { selector: "button span" }));
  await waitFor(() =>
    expect(api.coinManagement.operations).toHaveBeenLastCalledWith(
      expect.objectContaining({ source_type: "manual_reward" }),
      expect.anything()
    )
  );
});
