import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useUserStore } from "@/stores/user";
import { CoinsWallet } from "./CoinsWallet";
vi.mock("@/lib/request", () => ({
  api: {
    coins: { wallet: vi.fn(), entries: vi.fn() },
    learningRewards: { day: vi.fn() }
  }
}));
import { api } from "@/lib/request";
function seed(id: string) {
  useUserStore.setState({
    user: {
      id,
      display_name: "test",
      avatar_url: "",
      roles: ["teacher", "student"],
      active_role: "teacher"
    }
  });
}
function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <CoinsWallet />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  seed("u1");
  vi.mocked(api.learningRewards.day).mockResolvedValue({
    business_day: "2026-10-07",
    server_time: "2026-10-07T06:00:00Z",
    status: "reward_disabled",
    rule_version: null,
    minimum_units: null,
    daily_amount: null,
    qualifying_units: 0,
    awarded_amount: "0",
    operation_id: null,
    settled_at: null
  });
  vi.mocked(api.coins.entries).mockResolvedValue({
    items: [],
    snapshot: "0",
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
  });
});
it("shows exact real balance and pending state without fake claim buttons", async () => {
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "u1",
    balance: "9007199254740993",
    status: "deletion_pending"
  });
  open();
  expect(
    await screen.findByText("9,007,199,254,740,993 天生币")
  ).toBeInTheDocument();
  expect(screen.getByText(/钱包已暂停全部/)).toBeInTheDocument();
  expect(screen.getByText(/客服联系方式暂未配置/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /领取/ })
  ).not.toBeInTheDocument();
});
it("failed read does not render zero or stale balance after account switch", async () => {
  vi.mocked(api.coins.wallet)
    .mockResolvedValueOnce({
      owner_type: "user",
      owner_id: "u1",
      balance: "100",
      status: "open"
    })
    .mockRejectedValue(new Error("offline"));
  open();
  expect(await screen.findByText("100 天生币")).toBeInTheDocument();
  act(() => seed("u2"));
  expect(await screen.findByText(/余额加载失败/)).toBeInTheDocument();
  expect(screen.queryByText("100 天生币")).not.toBeInTheDocument();
  expect(screen.queryByText("0 天生币")).not.toBeInTheDocument();
});
it("late response from the previous account cannot overwrite current wallet", async () => {
  let resolve!: (v: Awaited<ReturnType<typeof api.coins.wallet>>) => void;
  vi.mocked(api.coins.wallet)
    .mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    )
    .mockResolvedValue({
      owner_type: "user",
      owner_id: "u2",
      balance: "7",
      status: "open"
    });
  open();
  await waitFor(() => expect(api.coins.wallet).toHaveBeenCalledOnce());
  act(() => seed("u2"));
  expect(await screen.findByText("7 天生币")).toBeInTheDocument();
  await act(async () =>
    resolve({
      owner_type: "user",
      owner_id: "u1",
      balance: "999",
      status: "open"
    })
  );
  expect(screen.queryByText("999 天生币")).not.toBeInTheDocument();
});

it("refresh after pagination discards snapshot and reloads the cached first page", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60000 } }
  });
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "u1",
    balance: "1",
    status: "open"
  });
  let latest = false;
  vi.mocked(api.coins.entries).mockImplementation(async (query) => ({
    items: [
      {
        id: "1",
        operation_id: "op",
        kind: "credit",
        source_type: "manual_reward",
        delta: latest ? "987" : "1",
        balance_after: "1",
        created_at: "2026-10-06T00:00:00Z"
      }
    ],
    snapshot: "20",
    pagination: {
      page: query?.page ?? 1,
      page_size: 20,
      total: 21,
      total_pages: 2
    }
  }));
  render(
    <QueryClientProvider client={client}>
      <CoinsWallet />
    </QueryClientProvider>
  );
  await screen.findByText("+1 天生币");
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.click(screen.getByText("下一页"));
  await waitFor(() =>
    expect(api.coins.entries).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, snapshot: "20" }),
      expect.anything()
    )
  );
  latest = true;
  fireEvent.click(screen.getByText("刷新"));
  expect(await screen.findByText("+987 天生币")).toBeInTheDocument();
  expect(vi.mocked(api.coins.entries).mock.calls.at(-1)?.[0]).toMatchObject({
    page: 1,
    snapshot: undefined
  });
});
it("returning from account deletion reloads status even inside the cache freshness interval", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60000 } }
  });
  client.setQueryData(["coins", "user", "u1", "wallet"], {
    owner_type: "user",
    owner_id: "u1",
    balance: "100",
    status: "open"
  });
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "u1",
    balance: "100",
    status: "deletion_pending"
  });
  render(
    <QueryClientProvider client={client}>
      <CoinsWallet />
    </QueryClientProvider>
  );
  expect(await screen.findByText(/钱包已暂停全部/)).toBeInTheDocument();
  expect(api.coins.wallet).toHaveBeenCalledOnce();
});
it("manual refresh also reloads rewards earned on another device", async () => {
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "u1",
    balance: "0",
    status: "open"
  });
  vi.mocked(api.learningRewards.day).mockResolvedValue({
    business_day: "2026-10-07",
    server_time: "2026-10-07T01:00:00Z",
    status: "in_progress",
    rule_version: "v1",
    minimum_units: 2,
    daily_amount: "13",
    qualifying_units: 0,
    awarded_amount: "0",
    operation_id: null,
    settled_at: null
  });
  open();
  await screen.findByText(/奖励进度 0\/2/);
  vi.mocked(api.learningRewards.day).mockResolvedValue({
    business_day: "2026-10-07",
    server_time: "2026-10-07T01:00:00Z",
    status: "awarded",
    rule_version: "v1",
    minimum_units: 2,
    daily_amount: "13",
    qualifying_units: 2,
    awarded_amount: "13",
    operation_id: "op",
    settled_at: "2026-10-07T01:00:00Z"
  });
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "u1",
    balance: "13",
    status: "open"
  });
  await act(async () => {
    screen.getByRole("button", { name: "刷新" }).click();
  });
  await screen.findByText(/该日奖励已到账 13/);
  await screen.findByText("13 天生币");
  expect(
    vi.mocked(api.coins.entries).mock.lastCall?.[0]?.snapshot
  ).toBeUndefined();
});
