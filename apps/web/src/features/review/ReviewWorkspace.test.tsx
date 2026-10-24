import { beforeEach, expect, it, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearUserPending, savePending } from "./pending";
import { HttpError } from "@tsz/api-client";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { ReviewWorkspace } from "./ReviewWorkspace";
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  items: vi.fn(),
  session: vi.fn(),
  answer: vi.fn(),
  start: vi.fn(),
  enrollment: vi.fn(),
  pause: vi.fn(),
  reveal: vi.fn(),
  push: vi.fn()
}));
vi.mock("@/lib/request", () => ({ api: { memory: mocks } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
const base = {
  id: "s",
  state: "active",
  settings: { cefr_level: "A1", english_variant: "BrE" },
  target_count: 1,
  answered_count: 0,
  server_time: "2026-10-24T00:00:00Z",
  expires_at: "2026-10-25T00:00:00Z",
  items: [
    {
      id: "i",
      memory_id: "m",
      kind: "due",
      answered: false,
      content_available: true,
      revealed: false,
      prompt: { definition: "苹果", part_of_speech: "noun" },
      revealed_answers: null,
      feedback: null,
      expires_at: "2026-10-25T00:00:00Z"
    }
  ]
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  clearUserPending("u");
  localStorage.clear();
  useUserStore.setState({
    user: {
      id: "u",
      display_name: "同学",
      phone: "19900001111",
      roles: ["student"],
      active_role: "student",
      avatar_url: ""
    },
    hydrated: true,
    onboarded: true
  });
});
it("旧后端404显示未开放，不伪装成没有到期内容", async () => {
  mocks.overview.mockRejectedValue(new HttpError(404, "missing"));
  renderWithProviders(<ReviewWorkspace />);
  expect(await screen.findByRole("alert")).toHaveTextContent("尚未开放");
  expect(screen.queryByText("现在没有到期内容")).not.toBeInTheDocument();
});
it("明确开启后刷新记忆摘要", async () => {
  const summary = {
    available: true,
    enabled: false,
    answer_profile: "BrE",
    due_count: 0,
    relearning_count: 0,
    later_count: 0,
    paused_count: 0,
    unavailable_count: 0,
    current_session_id: null
  };
  mocks.overview.mockResolvedValue(summary);
  mocks.enrollment.mockImplementation(() => {
    mocks.overview.mockResolvedValue({ ...summary, enabled: true });
    return Promise.resolve({ ...summary, enabled: true });
  });
  mocks.items.mockResolvedValue({ items: [], next_cursor: null });
  renderWithProviders(<ReviewWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "开启个人记忆" }));
  await waitFor(() =>
    expect(mocks.enrollment).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  );
  expect(
    await screen.findByRole("button", { name: "开始复习，最多 20 项" })
  ).toBeDisabled();
});
it("未知结果保留相同请求，重试后展示判定且不伪造金币", async () => {
  mocks.session.mockResolvedValue(base);
  mocks.answer.mockRejectedValueOnce(new Error("网络中断"));
  const done = {
    ...base,
    state: "completed",
    answered_count: 1,
    items: [
      {
        ...base.items[0],
        answered: true,
        feedback: {
          answer_id: "a",
          is_correct: true,
          submitted_answer: "apple",
          accepted_answers: ["apple"],
          memory_effect: "review_passed",
          accepted_at: base.server_time
        }
      }
    ]
  };
  mocks.answer.mockResolvedValueOnce({
    answer_id: "a",
    item_id: "i",
    is_correct: true,
    memory_effect: "review_passed",
    next_due_at: "2026-10-27T00:00:00Z",
    accepted_at: base.server_time,
    session: done
  });
  renderWithProviders(<ReviewWorkspace sessionId="s" />);
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "确认答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络中断");
  fireEvent.click(
    await screen.findByRole("button", { name: "核对并重试上次答案" })
  );
  expect(
    await screen.findByRole("heading", { name: "答对了" })
  ).toBeInTheDocument();
  expect(mocks.answer.mock.calls[0]?.[1]).toEqual(
    mocks.answer.mock.calls[1]?.[1]
  );
  expect(localStorage.getItem("tsz:review-pending:u:s")).toBeNull();
  expect(screen.queryByText(/已到账/)).not.toBeInTheDocument();
});
const summary = {
  available: true,
  enabled: true,
  answer_profile: "BrE",
  due_count: 1,
  relearning_count: 0,
  later_count: 0,
  paused_count: 0,
  unavailable_count: 0,
  current_session_id: null
};
function controlledSession() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = renderWithProviders(
    <QueryClientProvider client={client}>
      <ReviewWorkspace sessionId="s" />
    </QueryClientProvider>
  );
  return { client, view };
}
it("另一设备完成当前题后不把旧草稿提交给下一题", async () => {
  const other = {
    ...base.items[0]!,
    id: "b",
    prompt: { definition: "银行", part_of_speech: "noun" }
  };
  mocks.session.mockResolvedValue({
    ...base,
    target_count: 2,
    items: [...base.items, other]
  });
  const { client } = controlledSession();
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  act(() =>
    client.setQueryData(["review", "u", "s"], {
      ...base,
      target_count: 2,
      answered_count: 1,
      items: [{ ...base.items[0], answered: true }, other]
    })
  );
  expect(
    await screen.findByRole("heading", { name: "银行" })
  ).toBeInTheDocument();
  expect(screen.getByLabelText("英文拼写")).toHaveValue("");
  expect(screen.getByRole("button", { name: "确认答案" })).toBeDisabled();
  expect(mocks.answer).not.toHaveBeenCalled();
});
it("迟到的旧查询不能覆盖已揭示状态", async () => {
  let resolveOld!: (value: typeof base) => void;
  mocks.session.mockResolvedValueOnce(base).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      })
  );
  mocks.reveal.mockResolvedValue({
    ...base,
    items: [{ ...base.items[0], revealed: true, revealed_answers: ["apple"] }]
  });
  const { client } = controlledSession();
  await screen.findByLabelText("英文拼写");
  let refresh!: Promise<void>;
  act(() => {
    refresh = client.refetchQueries({ queryKey: ["review", "u", "s"] });
  });
  fireEvent.click(screen.getByRole("button", { name: "查看答案" }));
  expect(await screen.findByText("apple")).toBeInTheDocument();
  await act(async () => {
    resolveOld(base);
    await refresh;
  });
  expect(screen.getByText("apple")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看答案" })).toBeDisabled();
});
it("已完成的未知开始请求先对账，再按当前模式开始新批次", async () => {
  mocks.overview.mockResolvedValue(summary);
  mocks.items.mockResolvedValue({ items: [], next_cursor: null });
  savePending("u", "start", {
    idempotency_key: "old-start",
    mode: "retest",
    limit: 20
  });
  mocks.start
    .mockResolvedValueOnce({ ...base, id: "old", state: "completed" })
    .mockResolvedValueOnce({ ...base, id: "new" });
  renderWithProviders(<ReviewWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: "开始复习，最多 20 项" })
  );
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/review/new")
  );
  expect(mocks.start.mock.calls[0]?.[0]).toMatchObject({
    idempotency_key: "old-start",
    mode: "retest"
  });
  expect(mocks.start.mock.calls[1]?.[0]).toMatchObject({ mode: "due" });
});
it("离开页面后迟到的开始响应不能强制跳转", async () => {
  mocks.overview.mockResolvedValue(summary);
  mocks.items.mockResolvedValue({ items: [], next_cursor: null });
  let resolve!: (value: typeof base) => void;
  mocks.start.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const view = renderWithProviders(<ReviewWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: "开始复习，最多 20 项" })
  );
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => {
    resolve(base);
  });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.start.mock.calls[0]?.[1].signal.aborted).toBe(true);
});
it("查看答案响应丢失后从服务端恢复提示状态", async () => {
  mocks.session.mockResolvedValueOnce(base).mockResolvedValue({
    ...base,
    items: [{ ...base.items[0], revealed: true, revealed_answers: ["apple"] }]
  });
  mocks.reveal.mockRejectedValue(new Error("response lost"));
  renderWithProviders(<ReviewWorkspace sessionId="s" />);
  fireEvent.click(await screen.findByRole("button", { name: "查看答案" }));
  expect(await screen.findByText("apple")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看答案" })).toBeDisabled();
});
it("暂停版本冲突后刷新并使用新版本重试", async () => {
  mocks.overview.mockResolvedValue(summary);
  const item = {
    id: "m",
    label: "apple",
    stage: "learning",
    due_at: base.server_time,
    paused: false,
    content_available: true,
    revision: 1
  };
  mocks.items.mockResolvedValue({ items: [item], next_cursor: null });
  mocks.pause
    .mockImplementationOnce(() => {
      mocks.items.mockResolvedValue({
        items: [{ ...item, revision: 2 }],
        next_cursor: null
      });
      return Promise.reject(new HttpError(409, "changed"));
    })
    .mockResolvedValue(item);
  renderWithProviders(<ReviewWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "暂停此项" }));
  await waitFor(() => expect(mocks.items).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "暂停此项" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "暂停此项" }));
  await waitFor(() =>
    expect(mocks.pause).toHaveBeenLastCalledWith(
      "m",
      true,
      2,
      expect.anything()
    )
  );
});
it("无效会话404不显示为全局功能未开放，并展示冻结拼写档案", async () => {
  mocks.session.mockResolvedValue(base);
  const { client } = controlledSession();
  expect(await screen.findByText(/英式拼写（本批次固定）/)).toBeInTheDocument();
  mocks.session.mockRejectedValue(new HttpError(404, "not found"));
  await act(async () => {
    await client.refetchQueries({ queryKey: ["review", "u", "s"] });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("本次复习不存在");
  expect(screen.queryByText(/功能尚未开放/)).not.toBeInTheDocument();
});
it("切换拼写档案后从新档案第一页读取", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  mocks.overview.mockResolvedValue(summary);
  mocks.items.mockResolvedValue({ items: [], next_cursor: "old-cursor" });
  renderWithProviders(
    <QueryClientProvider client={client}>
      <ReviewWorkspace />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(mocks.items).toHaveBeenCalledWith(
      "all",
      "old-cursor",
      expect.anything()
    )
  );
  mocks.items.mockClear();
  act(() => {
    client.setQueryData(["memory", "u", "overview"], {
      ...summary,
      answer_profile: "AmE"
    });
  });
  await waitFor(() =>
    expect(mocks.items).toHaveBeenCalledWith(
      "all",
      undefined,
      expect.anything()
    )
  );
});
