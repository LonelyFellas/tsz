import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@tsz/shared/i18n";
import { MyCoinsPage } from "./MyCoins";
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
import { HttpError } from "@tsz/api-client";
import { useAuthStore } from "@/lib/auth";
import { CoinsPage } from "./Coins";
vi.mock("@/lib/env", () => ({ env: { API_BASE_URL: "/api/v1" } }));
vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: {
      coins: { wallet: vi.fn(), entries: vi.fn() },
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
  localStorage.clear();
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
function open(myWallet = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <App>{myWallet ? <MyCoinsPage /> : <CoinsPage />}</App>
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  return {
    ...view,
    setLocale: (locale: InterfaceLocale) => view.rerender(content(locale))
  };
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
    screen.getByText("发放记录", { selector: ".ui-tabs-tab-btn" })
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
it("hides cached records and closes details when refreshing fails", async () => {
  vi.mocked(api.coinManagement.operations).mockResolvedValueOnce({
    items: [operation],
    pagination
  });
  open();
  fireEvent.click(
    screen.getByText("发放记录", { selector: ".ui-tabs-tab-btn" })
  );
  fireEvent.click(await screen.findByText("查看详情"));
  expect(screen.getByText("内部凭据")).toBeInTheDocument();
  vi.mocked(api.coinManagement.operations).mockRejectedValue(
    new HttpError(503, "unavailable")
  );
  fireEvent.click(screen.getByText("刷新记录"));
  await screen.findByText("发放记录加载失败，请重试查询");
  expect(screen.queryByText("查看详情")).not.toBeInTheDocument();
  expect(screen.queryByText("内部凭据")).not.toBeInTheDocument();
  expect(
    screen.queryByText("撤销发放", { selector: "button span" })
  ).not.toBeInTheDocument();
});
it("name filters and reset clear both visible and collapsed conditions", async () => {
  open();
  fireEvent.click(
    screen.getByText("发放记录", { selector: ".ui-tabs-tab-btn" })
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
    screen.getByText("发放记录", { selector: ".ui-tabs-tab-btn" })
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

it("四语切换保留发放草稿、焦点、冻结确认、在途请求及失败后的原幂等载荷", async () => {
  let reject!: (error: unknown) => void;
  vi.mocked(api.coinManagement.credit)
    .mockImplementationOnce(
      () =>
        new Promise((_, failure) => {
          reject = failure;
        })
    )
    .mockRejectedValue(new HttpError(504, "upstream original detail"));
  const view = open();
  await prepare();
  const confirm = screen.getByRole("dialog");
  fireEvent.click(within(confirm).getByText("返回修改"));
  const input = screen.getByLabelText("业务单号");
  input.focus();
  const reads = [
    api.coinManagement.accounts,
    api.coinManagement.entries,
    api.coinManagement.operations
  ].map((fn) => vi.mocked(fn).mock.calls.length);
  for (const locale of INTERFACE_LOCALES) {
    view.setLocale(locale);
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("invoice1");
    expect(input).toHaveFocus();
  }
  fireEvent.click(screen.getByText("Review credit"));
  await screen.findByText("Confirm coin credit");
  fireEvent.click(screen.getByText("Confirm credit"));
  await waitFor(() =>
    expect(api.coinManagement.credit).toHaveBeenCalledTimes(1)
  );
  const first = vi.mocked(api.coinManagement.credit).mock.calls[0]![0];
  for (const locale of INTERFACE_LOCALES) {
    view.setLocale(locale);
    expect(screen.getByRole("dialog")).toBe(confirm);
    expect(within(confirm).getByText(/9,007,199,254,740,993/)).toBeVisible();
    expect(within(confirm).getByText("invoice1")).toBeVisible();
    expect(within(confirm).getByText("verified")).toBeVisible();
    expect(within(confirm).getByText("user1")).toBeVisible();
    expect(
      within(confirm)
        .getAllByRole("button")
        .every((b) => b.hasAttribute("disabled"))
    ).toBe(true);
    expect(api.coinManagement.credit).toHaveBeenCalledTimes(1);
  }
  expect(
    [
      api.coinManagement.accounts,
      api.coinManagement.entries,
      api.coinManagement.operations
    ].map((fn) => vi.mocked(fn).mock.calls.length)
  ).toEqual(reads);
  await act(async () => reject(new HttpError(504, "upstream original detail")));
  expect(within(confirm).getAllByRole("alert").at(-1)).toHaveTextContent(
    "The result is unconfirmed."
  );
  view.setLocale("zh-Hant");
  expect(within(confirm).getAllByRole("alert").at(-1)).toHaveTextContent(
    "暫時無法確認操作結果"
  );
  expect(within(confirm).getAllByRole("alert").at(-1)).toHaveTextContent(
    "upstream original detail"
  );
  fireEvent.click(within(confirm).getByText("確認發放"));
  await waitFor(() =>
    expect(api.coinManagement.credit).toHaveBeenCalledTimes(2)
  );
  expect(vi.mocked(api.coinManagement.credit).mock.calls[1]![0]).toEqual(first);
  expect(first).toEqual({
    owner_type: "user",
    owner_id: "user1",
    category: "purchase",
    amount: "9007199254740993",
    event_id: "invoice1",
    reason: "verified",
    evidence_ref: null,
    idempotency_key: expect.any(String)
  });
});

it("已展示的金额校验随语言变化，不提交非法大整数或清空输入", async () => {
  const view = open();
  await prepare();
  fireEvent.click(screen.getByText("返回修改"));
  const amount = screen.getByLabelText("天生币数量");
  fireEvent.change(amount, { target: { value: "9223372036854775808" } });
  fireEvent.change(screen.getByLabelText("业务单号"), {
    target: { value: "" }
  });
  fireEvent.change(screen.getByLabelText("发放原因"), {
    target: { value: "" }
  });
  fireEvent.click(screen.getByText("核对并发放"));
  await screen.findByText("请输入 1 至 9,223,372,036,854,775,807 之间的整数");
  view.setLocale("en-GB");
  expect(
    await screen.findByText(
      "Enter an integer from 1 to 9,223,372,036,854,775,807."
    )
  ).toBeVisible();
  expect(screen.getByText("Enter a transaction reference.")).toBeVisible();
  expect(screen.getByText("Enter a reason for the credit.")).toBeVisible();
  expect(screen.getByLabelText("Coin amount")).toBe(amount);
  expect(amount).toHaveValue("9223372036854775808");
  expect(api.coinManagement.credit).not.toHaveBeenCalled();
});

it("详情跨语保持身份，撤销在途及已知错误重绘后仍重试原请求", async () => {
  vi.mocked(api.coinManagement.operations).mockResolvedValue({
    items: [operation],
    pagination
  });
  let reject!: (error: unknown) => void;
  vi.mocked(api.coinManagement.reverse)
    .mockImplementationOnce(
      () =>
        new Promise((_, failure) => {
          reject = failure;
        })
    )
    .mockRejectedValue(
      new HttpError(409, "raw known error", [], "coin_insufficient_balance")
    );
  const view = open();
  fireEvent.click(
    screen.getByText("发放记录", { selector: ".ui-tabs-tab-btn" })
  );
  fireEvent.click(await screen.findByText("查看详情"));
  const drawer = screen.getByRole("dialog", { hidden: true });
  const reads = vi.mocked(api.coinManagement.operations).mock.calls.length;
  for (const locale of INTERFACE_LOCALES) {
    view.setLocale(locale);
    expect(screen.getByRole("dialog", { hidden: true })).toBe(drawer);
    expect(
      within(drawer).getByText(operation.evidence_ref)
    ).toBeInTheDocument();
    expect(within(drawer).getByText(operation.reason)).toBeInTheDocument();
    expect(within(drawer).getByText(operation.event_id)).toBeInTheDocument();
    expect(
      within(drawer).getByText(
        new Date(operation.created_at).toLocaleString("zh-CN")
      )
    ).toBeInTheDocument();
  }
  fireEvent.click(
    within(drawer).getByText("Reverse credit", { selector: "button span" })
  );
  const modal = screen.getByRole("dialog");
  const reason = within(modal).getByLabelText("Reason for reversal");
  fireEvent.change(reason, { target: { value: "原始冲正原因 centre" } });
  reason.focus();
  view.setLocale("zh-Hans");
  expect(within(modal).getByLabelText("撤销原因")).toBe(reason);
  expect(reason).toHaveFocus();
  fireEvent.click(within(modal).getByText("确认扣回"));
  await waitFor(() =>
    expect(api.coinManagement.reverse).toHaveBeenCalledTimes(1)
  );
  const first = vi.mocked(api.coinManagement.reverse).mock.calls[0];
  view.setLocale("en-US");
  expect(reason).toHaveValue("原始冲正原因 centre");
  expect(reason).toBeDisabled();
  expect(api.coinManagement.operations).toHaveBeenCalledTimes(reads);
  await act(async () =>
    reject(
      new HttpError(409, "raw known error", [], "coin_insufficient_balance")
    )
  );
  expect(
    await within(modal).findByText(
      "This account has insufficient coins to reverse this credit."
    )
  ).toBeVisible();
  view.setLocale("zh-Hant");
  expect(
    within(modal).getByText("此帳號餘額不足，無法扣回此筆天生幣")
  ).toBeVisible();
  fireEvent.click(within(modal).getByText("確認扣回"));
  await waitFor(() =>
    expect(api.coinManagement.reverse).toHaveBeenCalledTimes(2)
  );
  expect(vi.mocked(api.coinManagement.reverse).mock.calls[1]).toEqual(first);
});

it("我的天生币分页快照、精确余额和请求身份跨语保留", async () => {
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "admin",
    owner_id: profile.id,
    balance: "9223372036854775807",
    status: "open"
  });
  vi.mocked(api.coins.entries).mockResolvedValue({
    items: [],
    snapshot: "9007199254740993",
    pagination: { ...pagination, total: 21, total_pages: 2 }
  });
  const view = open(true);
  await screen.findByText("9,223,372,036,854,775,807 天生币");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(api.coins.entries).toHaveBeenLastCalledWith(
      { page: 2, page_size: 20, snapshot: "9007199254740993" },
      expect.anything()
    )
  );
  const counts = [
    vi.mocked(api.coins.wallet).mock.calls.length,
    vi.mocked(api.coins.entries).mock.calls.length
  ];
  for (const locale of INTERFACE_LOCALES) {
    view.setLocale(locale);
    expect(screen.getByText(/9,223,372,036,854,775,807/)).toBeInTheDocument();
  }
  expect(screen.getByRole("heading", { name: "My coins" })).toBeVisible();
  expect([
    vi.mocked(api.coins.wallet).mock.calls.length,
    vi.mocked(api.coins.entries).mock.calls.length
  ]).toEqual(counts);
});

it("操作历史跨语保留未提交筛选、展开、页码和旧列偏好，不因显示标签重发查询", async () => {
  vi.mocked(api.coinManagement.operations).mockImplementation(async (q) => ({
    items: [operation],
    pagination: { ...pagination, page: q?.page ?? 1, total: 21, total_pages: 2 }
  }));
  const view = open();
  fireEvent.click(
    screen.getByText("发放记录", { selector: ".ui-tabs-tab-btn" })
  );
  await screen.findByText("查看详情");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(api.coinManagement.operations).toHaveBeenLastCalledWith(
      { page: 2, page_size: 20, include_names: true },
      expect.anything()
    )
  );
  const input = screen.getByPlaceholderText("输入姓名或账号编号");
  fireEvent.change(input, { target: { value: "未提交原文 centre" } });
  fireEvent.click(screen.getByText("更多筛选"));
  const actor = screen.getByPlaceholderText("输入姓名或操作人编号");
  fireEvent.change(actor, { target: { value: "原操作人" } });
  fireEvent.click(screen.getByRole("button", { name: /列设置/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "状态" }));
  const reads = vi.mocked(api.coinManagement.operations).mock.calls.length;
  for (const locale of INTERFACE_LOCALES) {
    view.setLocale(locale);
    expect(input).toHaveValue("未提交原文 centre");
    expect(actor).toHaveValue("原操作人");
    expect(actor.closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "false"
    );
  }
  expect(screen.getByRole("checkbox", { name: "Status" })).not.toBeChecked();
  expect(
    screen.queryByRole("columnheader", { name: "Status" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Fewer filters" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(api.coinManagement.operations).toHaveBeenCalledTimes(reads);
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(api.coinManagement.operations).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        owner_search: "未提交原文 centre",
        actor_search: "原操作人",
        include_names: true
      }),
      expect.anything()
    )
  );
});
