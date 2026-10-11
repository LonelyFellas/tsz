import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserResources } from "./UserResources";
const state = vi.hoisted(() => ({
  keys: [] as string[],
  wallet: vi.fn(),
  entries: vi.fn(),
  identityDocuments: vi.fn(),
  identityFile: vi.fn()
}));
vi.mock("@/lib/auth", () => ({
  usePermission: (key: string) => state.keys.includes(key),
  api: { users: state }
}));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = () => (
    <QueryClientProvider client={client}>
      <UserResources userId="u1" />
    </QueryClientProvider>
  );
  return { ...render(view()), view };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.keys = [];
  state.wallet.mockResolvedValue({ balance: "9007199254740993" });
  state.entries.mockResolvedValue({
    items: [
      {
        id: "1",
        delta: "100",
        balance_after: "123456",
        created_at: "2026-10-11T01:00:00Z"
      }
    ],
    pagination: { total: 1 },
    snapshot: "1"
  });
  state.identityDocuments.mockResolvedValue([]);
});
describe("用户资源独立授权", () => {
  it("未授权时不展示入口、不请求敏感资源", () => {
    mount();
    expect(screen.queryByText("查看天生币余额")).toBeNull();
    expect(screen.queryByText("查看天生币账单")).toBeNull();
    expect(screen.queryByText("查看身份证件")).toBeNull();
    expect(state.wallet).not.toHaveBeenCalled();
    expect(state.entries).not.toHaveBeenCalled();
    expect(state.identityDocuments).not.toHaveBeenCalled();
    expect(state.identityFile).not.toHaveBeenCalled();
  });
  it("余额按需读取且保持大整数精度，撤权后立即隐藏", async () => {
    state.keys = ["users.read_coin_balance"];
    const result = mount();
    expect(state.wallet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("查看天生币余额"));
    expect(
      await screen.findByText("9007199254740993 天生币")
    ).toBeInTheDocument();
    expect(state.entries).not.toHaveBeenCalled();
    state.keys = [];
    result.rerender(result.view());
    expect(screen.queryByText("9007199254740993 天生币")).toBeNull();
  });
  it("仅账单权限不显示缓存中的逐笔余额", async () => {
    state.keys = ["users.read_coin_entries"];
    mount();
    fireEvent.click(screen.getByText("查看天生币账单"));
    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.queryByText("123456")).toBeNull();
    expect(state.wallet).not.toHaveBeenCalled();
  });
  it("无认证材料显示空态，不请求原件", async () => {
    state.keys = ["users.read_identity"];
    mount();
    fireEvent.click(screen.getByText("查看身份证件"));
    await waitFor(() =>
      expect(screen.getByText("暂无已提交的身份证件")).toBeInTheDocument()
    );
    expect(state.identityDocuments).toHaveBeenCalledWith("u1");
    expect(state.identityFile).not.toHaveBeenCalled();
  });
});
