import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { useUserStore } from "@/stores/user";
import { LearningRewardSummary } from "./LearningRewardSummary";
vi.mock("@/lib/request", () => ({
  api: { learningRewards: { day: vi.fn() } }
}));
import { api } from "@/lib/request";
const awarded = {
  business_day: "2026-10-07",
  server_time: "2026-10-07T01:00:00Z",
  rule_version: "v1",
  minimum_units: 2,
  daily_amount: "13",
  qualifying_units: 2,
  status: "awarded" as const,
  awarded_amount: "13",
  operation_id: "op-a",
  settled_at: "2026-10-07T01:00:00Z"
};
function seed(id: string) {
  useUserStore.setState({
    user: {
      id,
      display_name: "test",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  seed("a");
});
it("never repeats an award notification for a replayed operation and keeps the historical day", async () => {
  vi.mocked(api.learningRewards.day).mockResolvedValue(awarded);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const notified = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LearningRewardSummary
        userId="a"
        businessDay="2026-10-07"
        completionId="completed"
        onAward={notified}
      />
    </QueryClientProvider>
  );
  expect(await screen.findByText(/该日奖励已到账/)).toHaveTextContent(
    "13 天生币"
  );
  expect(api.learningRewards.day).toHaveBeenCalledWith(
    "2026-10-07",
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  await act(() =>
    client.invalidateQueries({ queryKey: ["learning-rewards", "a"] })
  );
  expect(notified).toHaveBeenCalledTimes(1);
});
it("404 and failed reads never invent an award or replace a learning result", async () => {
  vi.mocked(api.learningRewards.day).mockRejectedValue(
    new HttpError(404, "Not found")
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <p>本轮已完成</p>
      <LearningRewardSummary userId="a" />
    </QueryClientProvider>
  );
  await screen.findByText("奖励功能尚未就绪。");
  expect(screen.getByText("本轮已完成")).toBeInTheDocument();
  expect(screen.queryByText(/已到账/)).not.toBeInTheDocument();
});
it("switching accounts aborts the old read and its late award cannot refresh the new wallet", async () => {
  let resolve!: (v: typeof awarded) => void;
  vi.mocked(api.learningRewards.day)
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    )
    .mockResolvedValue({
      ...awarded,
      status: "in_progress",
      qualifying_units: 0,
      awarded_amount: "0",
      operation_id: null,
      settled_at: null
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const notified = vi.fn();
  const view = (id: string) => (
    <QueryClientProvider client={client}>
      <LearningRewardSummary key={id} userId={id} onAward={notified} />
    </QueryClientProvider>
  );
  const { rerender } = render(view("a"));
  await waitFor(() => expect(api.learningRewards.day).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(api.learningRewards.day).mock.calls[0]![1]!.signal!;
  seed("b");
  rerender(view("b"));
  await screen.findByText(/奖励进度 0\/2/);
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve(awarded);
  });
  expect(screen.queryByText(/已到账/)).not.toBeInTheDocument();
  expect(notified).not.toHaveBeenCalled();
});
