import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
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
    screen.getByPlaceholderText("姓名 / UUID / 完整手机或邮箱"),
    { target: { value: "user1" } }
  );
  fireEvent.click(screen.getByText("查 找"));
  fireEvent.click(await screen.findByText("查看账户"));
  fireEvent.change(screen.getByLabelText("天生币数量"), {
    target: { value: "9007199254740993" }
  });
  fireEvent.change(screen.getByLabelText("稳定核验单号 / 奖励事件号"), {
    target: { value: "invoice1" }
  });
  fireEvent.change(screen.getByLabelText("入账原因（仅管理端可见）"), {
    target: { value: "verified" }
  });
  fireEvent.click(screen.getByText("核对并入账"));
  await screen.findByText("确认人工入账");
}
it("confirmation shows exact target and amount; timeout and unrelated grants preserve the request key", async () => {
  vi.mocked(api.coinManagement.credit).mockRejectedValue(
    new HttpError(504, "gateway timeout")
  );
  open();
  await prepare();
  expect(screen.getByText("9,007,199,254,740,993 天生币")).toBeInTheDocument();
  fireEvent.click(screen.getByText("确认入账"));
  await screen.findByText(/请求结果未知/);
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
  fireEvent.click(screen.getByText("确认入账"));
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
  expect(screen.queryByText("确认人工入账")).not.toBeInTheDocument();
});
it("query-only admin cannot credit and loss of access removes private data", async () => {
  useAuthStore
    .getState()
    .setProfile({ ...profile, permissions: ["coins.access"] });
  open();
  fireEvent.change(
    screen.getByPlaceholderText("姓名 / UUID / 完整手机或邮箱"),
    { target: { value: "user1" } }
  );
  fireEvent.click(screen.getByText("查 找"));
  fireEvent.click(await screen.findByText("查看账户"));
  expect(screen.queryByText("核对并入账")).not.toBeInTheDocument();
  act(() =>
    useAuthStore.getState().setProfile({ ...profile, permissions: [] })
  );
  expect(screen.queryByText("收款人")).not.toBeInTheDocument();
  expect(screen.getByText("没有天生币管理查询权限")).toBeInTheDocument();
});
it("manual operation filters exclude automatic rewards and submit supported source types", async () => {
  open();
  fireEvent.click(screen.getByText("操作记录与冲正"));
  fireEvent.mouseDown(screen.getByLabelText("类型"));
  await screen.findByText("人工奖励");
  expect(screen.queryByText("邀请奖励")).not.toBeInTheDocument();
  expect(screen.queryByText("注销余额作废")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("人工奖励"));
  fireEvent.click(screen.getByRole("button", { name: /筛\s*选/ }));
  await waitFor(() =>
    expect(api.coinManagement.operations).toHaveBeenLastCalledWith(
      expect.objectContaining({ source_type: "manual_reward" }),
      expect.anything()
    )
  );
});
