import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useUserStore } from "@/stores/user";
import { Invitations } from "./Invitations";
vi.mock("@/lib/request", () => ({
  api: {
    invitations: { overview: vi.fn(), records: vi.fn(), createCode: vi.fn() }
  }
}));
import { api } from "@/lib/request";
function seed(id: string) {
  useUserStore.setState({
    user: {
      id,
      display_name: "Test",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
}
function open() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
          }
        })
      }
    >
      <Invitations />
    </QueryClientProvider>
  );
}
const overview = {
  invite_code: "0123456789ABCDEF",
  reward_amount: null,
  can_receive_reward: true
};
beforeEach(() => {
  vi.resetAllMocks();
  seed("u1");
  vi.mocked(api.invitations.overview).mockResolvedValue(overview);
  vi.mocked(api.invitations.records).mockResolvedValue({
    items: [],
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
  });
});
it("shows disabled rewards honestly, creates a stable code and copies a registration link", async () => {
  vi.mocked(api.invitations.overview)
    .mockResolvedValueOnce({ ...overview, invite_code: null })
    .mockResolvedValue(overview);
  vi.mocked(api.invitations.createCode).mockResolvedValue({
    invite_code: overview.invite_code
  });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true
  });
  open();
  fireEvent.click(
    await screen.findByRole("button", { name: "生成我的邀请码" })
  );
  fireEvent.click(await screen.findByRole("button", { name: "复制邀请链接" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/register?invite=0123456789ABCDEF`
    )
  );
  expect(screen.getByText(/邀请奖励暂未开启/)).toBeInTheDocument();
  expect(screen.queryByText(/已发放/)).not.toBeInTheDocument();
});
it("distinguishes actual awarded records from permanent skipped rewards and paused eligibility", async () => {
  vi.mocked(api.invitations.overview).mockResolvedValue({
    ...overview,
    reward_amount: "9007199254740993",
    can_receive_reward: false
  });
  vi.mocked(api.invitations.records).mockResolvedValue({
    items: [
      {
        invitee_user_id: "new1",
        invitee_name: "同学",
        reward_status: "awarded",
        reward_amount: "9007199254740993",
        created_at: "2026-10-06T00:00:00Z"
      },
      {
        invitee_user_id: "new2",
        invitee_name: null,
        reward_status: "inviter_unavailable",
        reward_amount: "0",
        created_at: "2026-10-06T00:00:00Z"
      }
    ],
    pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 }
  });
  open();
  expect(
    await screen.findByText("已发放 9,007,199,254,740,993 天生币")
  ).toBeInTheDocument();
  expect(screen.getByText(/你的账户当前不可接收奖励/)).toBeInTheDocument();
  expect(
    screen.getByText("未发放：注册时邀请人账户不可收奖")
  ).toBeInTheDocument();
});
it("account changes and failed reads cannot expose the previous code or invent empty records", async () => {
  open();
  await screen.findByText(overview.invite_code);
  vi.mocked(api.invitations.overview).mockRejectedValue(new Error("offline"));
  vi.mocked(api.invitations.records).mockRejectedValue(new Error("offline"));
  act(() => seed("u2"));
  expect(await screen.findByText(/邀请信息加载失败/)).toBeInTheDocument();
  expect(await screen.findByText(/邀请记录加载失败/)).toBeInTheDocument();
  expect(screen.queryByText(overview.invite_code)).not.toBeInTheDocument();
  expect(screen.queryByText("暂无邀请记录")).not.toBeInTheDocument();
});
