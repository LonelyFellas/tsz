import { beforeEach, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
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
  vi.clearAllMocks();
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
  await waitFor(() => expect(mocks.enrollment).toHaveBeenCalledWith(true));
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
