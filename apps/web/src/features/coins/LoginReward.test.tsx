import {
  QueryClient,
  QueryClientProvider,
  focusManager
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { LoginRewardDay } from "@tsz/types";
import { useUserStore } from "@/stores/user";
import { DailyLoginReward, LoginRewardSummary } from "./LoginReward";
vi.mock("@/lib/request", () => ({ api: { loginReward: { claim: vi.fn() } } }));
import { api } from "@/lib/request";

const awarded: LoginRewardDay = {
  business_day: "2026-10-17",
  server_time: "2026-10-17T05:00:00Z",
  next_day_starts_at: "2026-10-17T20:00:00Z",
  status: "awarded",
  awarded_amount: "1",
  operation_id: "operation-a"
};
function seed(id: string, phone = "19800000001") {
  useUserStore.setState({
    hydrated: true,
    connectionError: false,
    refreshUnconfirmed: false,
    user: {
      id,
      phone,
      display_name: "test",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
}
function open() {
  const client = new QueryClient();
  const invalidated = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <DailyLoginReward />
      <LoginRewardSummary />
      <p>学习页面</p>
    </QueryClientProvider>
  );
  return { client, invalidated, ...view };
}
beforeEach(() => {
  vi.resetAllMocks();
  seed("a");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

it("restored sessions auto-award once and refresh only the same user's wallet", async () => {
  vi.mocked(api.loginReward.claim).mockResolvedValue(awarded);
  const { client, invalidated } = open();
  await screen.findByText(/登录奖励已到账 1/);
  expect(api.loginReward.claim).toHaveBeenCalledTimes(1);
  expect(invalidated).toHaveBeenCalledWith({
    queryKey: ["coins", "user", "a"]
  });
  await act(() => client.refetchQueries({ queryKey: ["login-reward", "a"] }));
  expect(invalidated).toHaveBeenCalledTimes(1);
});

it("does not request before session restoration or phone binding", async () => {
  useUserStore.setState({ hydrated: false });
  open();
  expect(api.loginReward.claim).not.toHaveBeenCalled();
  act(() => seed("a", ""));
  expect(screen.getByText(/绑定手机号后/)).toBeInTheDocument();
  expect(api.loginReward.claim).not.toHaveBeenCalled();
  vi.mocked(api.loginReward.claim).mockResolvedValue(awarded);
  act(() => seed("a"));
  await screen.findByText(/登录奖励已到账 1/);
});

it("404 is visible in the wallet and never blocks login or learning", async () => {
  vi.mocked(api.loginReward.claim).mockRejectedValue(
    new HttpError(404, "unavailable")
  );
  const { invalidated } = open();
  await screen.findByText("登录奖励功能尚未就绪。");
  expect(screen.getByText("学习页面")).toBeInTheDocument();
  expect(screen.queryByText(/已到账/)).not.toBeInTheDocument();
  expect(invalidated).not.toHaveBeenCalled();
  expect(useUserStore.getState().user?.id).toBe("a");
});

it("switching accounts cancels the old request and ignores its late receipt", async () => {
  let resolve!: (value: LoginRewardDay) => void;
  let signal!: AbortSignal;
  vi.mocked(api.loginReward.claim)
    .mockImplementationOnce((options) => {
      signal = options!.signal!;
      return new Promise((r) => {
        resolve = r;
      });
    })
    .mockResolvedValue({
      ...awarded,
      status: "wallet_unavailable",
      awarded_amount: "0",
      operation_id: null
    });
  const { invalidated } = open();
  await waitFor(() => expect(api.loginReward.claim).toHaveBeenCalledTimes(1));
  act(() => seed("b"));
  await screen.findByText(/钱包暂停或关闭/);
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(awarded));
  expect(screen.queryByText(/已到账/)).not.toBeInTheDocument();
  expect(invalidated).not.toHaveBeenCalled();
});

it("a continuously visible session settles the next server business day without re-login", async () => {
  vi.useFakeTimers();
  // Deliberately skew the client clock; schedule from server_time, not local midnight.
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  focusManager.setFocused(true);
  vi.mocked(api.loginReward.claim)
    .mockResolvedValueOnce({ ...awarded, server_time: "2026-10-17T19:59:59Z" })
    .mockResolvedValue({
      ...awarded,
      business_day: "2026-10-18",
      server_time: "2026-10-17T20:00:00Z",
      next_day_starts_at: "2026-10-18T20:00:00Z",
      operation_id: "operation-b"
    });
  const { invalidated } = open();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(api.loginReward.claim).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(api.loginReward.claim).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/2026-10-18 登录奖励已到账/)).toBeInTheDocument();
  expect(invalidated).toHaveBeenCalledTimes(2);
});

it("rechecks a paused wallet on return without requiring logout", async () => {
  vi.mocked(api.loginReward.claim)
    .mockResolvedValueOnce({
      ...awarded,
      status: "wallet_unavailable",
      awarded_amount: "0",
      operation_id: null
    })
    .mockResolvedValue(awarded);
  const { invalidated } = open();
  await screen.findByText(/钱包暂停或关闭/);
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await screen.findByText(/登录奖励已到账 1/);
  expect(api.loginReward.claim).toHaveBeenCalledTimes(2);
  expect(invalidated).toHaveBeenCalledTimes(1);
});
