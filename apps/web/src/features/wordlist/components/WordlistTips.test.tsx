import { renderWithProviders } from "@/test/render";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useUserStore } from "@/stores/user";
import { HttpError } from "@tsz/api-client";
import { act } from "@testing-library/react";
import { TipPanel } from "./WordlistTips";
vi.mock("@/lib/request", () => ({
  api: { wordList: { tip: vi.fn(), tipReceipt: vi.fn() } }
}));
import { api } from "@/lib/request";
const list = {
  id: "list",
  owner_user_id: "author",
  owner_name: "作者",
  name: "词表",
  state: "published" as const,
  revision: 3,
  item_count: 1,
  created_at: "",
  updated_at: ""
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useUserStore.setState({
    user: {
      id: "payer",
      display_name: "读者",
      avatar_url: "",
      active_role: "student",
      roles: ["student"]
    }
  });
});
it("requires explicit amount and confirmation, then restores a lost response from its event", async () => {
  vi.mocked(api.wordList.tip).mockRejectedValueOnce(new Error("lost response"));
  const view = renderWithProviders(<TipPanel list={list} />);
  fireEvent.change(screen.getByLabelText("投币数量"), {
    target: { value: "7" }
  });
  fireEvent.click(screen.getByRole("button", { name: "投币" }));
  expect(api.wordList.tip).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  await screen.findByText(/结果尚未确认/);
  const intent = vi.mocked(api.wordList.tip).mock.calls[0]![1];
  expect(
    JSON.parse(sessionStorage.getItem("wordlist-tip:payer:list")!)
  ).toEqual(intent);
  view.unmount();
  vi.mocked(api.wordList.tipReceipt).mockResolvedValue({
    event_id: intent.event_id,
    wordlist_id: "list",
    payer_user_id: "payer",
    author_user_id: "author",
    amount: "7",
    operation_id: "op",
    created_at: ""
  });
  renderWithProviders(<TipPanel list={list} />);
  fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
  await screen.findByRole("status");
  expect(api.wordList.tipReceipt).toHaveBeenCalledWith(
    intent.event_id,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(api.wordList.tip).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("wordlist-tip:payer:list")).toBeNull();
});
it("rejects self-tipping in UI and preserves an unresolved original intent", async () => {
  useUserStore.setState({
    user: {
      id: "author",
      display_name: "作者",
      avatar_url: "",
      active_role: "student",
      roles: ["student"]
    }
  });
  const view = renderWithProviders(<TipPanel list={list} />);
  expect(
    screen.getByRole("button", { name: "不能给自己的词表投币" })
  ).toBeDisabled();
  view.unmount();
  useUserStore.setState({
    user: {
      id: "payer",
      display_name: "读者",
      avatar_url: "",
      active_role: "student",
      roles: ["student"]
    }
  });
  const intent = { event_id: "event", idempotency_key: "key", amount: "7" };
  sessionStorage.setItem("wordlist-tip:payer:list", JSON.stringify(intent));
  vi.mocked(api.wordList.tipReceipt).mockRejectedValue(new Error("network"));
  renderWithProviders(<TipPanel list={list} />);
  fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("结果尚未确认")
  );
  expect(api.wordList.tip).not.toHaveBeenCalled();
  expect(
    JSON.parse(sessionStorage.getItem("wordlist-tip:payer:list")!)
  ).toEqual(intent);
});

it.each(["switch", "unmount"])(
  "late receipt 404 after %s cannot charge the new session",
  async (mode) => {
    const intent = { event_id: "event", idempotency_key: "key", amount: "7" };
    sessionStorage.setItem("wordlist-tip:payer:list", JSON.stringify(intent));
    let reject!: (error: unknown) => void;
    vi.mocked(api.wordList.tipReceipt).mockReturnValue(
      new Promise((_, no) => {
        reject = no;
      })
    );
    const view = renderWithProviders(<TipPanel list={list} />);
    fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
    await waitFor(() => expect(api.wordList.tipReceipt).toHaveBeenCalled());
    const signal = vi.mocked(api.wordList.tipReceipt).mock.calls[0]![1]?.signal;
    if (mode === "switch")
      act(() =>
        useUserStore.setState({
          user: {
            id: "different",
            display_name: "新用户",
            avatar_url: "",
            active_role: "student",
            roles: ["student"]
          }
        })
      );
    else view.unmount();
    await act(async () => reject(new HttpError(404, "not found")));
    expect(signal?.aborted).toBe(true);
    expect(api.wordList.tip).not.toHaveBeenCalled();
    expect(
      JSON.parse(sessionStorage.getItem("wordlist-tip:payer:list")!)
    ).toEqual(intent);
  }
);
