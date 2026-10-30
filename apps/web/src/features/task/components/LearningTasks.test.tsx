import { HttpError } from "@tsz/api-client";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
const mocks = vi.hoisted(() => ({
  day: vi.fn(),
  run: vi.fn(),
  questions: vi.fn(),
  answer: vi.fn(),
  list: vi.fn(),
  plansList: vi.fn(),
  plansDetail: vi.fn(),
  cyclePreview: vi.fn(),
  cycleCreate: vi.fn(),
  cycles: vi.fn(),
  user: { id: "learner-a", roles: ["student"] }
}));
vi.mock("@/lib/request", () => ({
  api: {
    learning: mocks,
    learningPlans: {
      list: mocks.plansList,
      detail: mocks.plansDetail,
      cyclePreview: mocks.cyclePreview,
      cycleCreate: mocks.cycleCreate,
      cycles: mocks.cycles
    },
    learningRewards: { day: mocks.day }
  }
}));
vi.mock("@/stores/user", () => ({
  useUserStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ user: mocks.user }),
    { getState: () => ({ user: mocks.user }) }
  )
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { PlanCoverage } from "./PlanCoverage";
import type { LearningPlan } from "@tsz/types";
import { LearningPractice, LearningTaskList } from "./LearningTasks";
const run = {
  id: "run",
  task_id: "task",
  state: "active",
  target_count: 2,
  answered_count: 0,
  correct_count: 0,
  settings: { cefr_level: "A1", english_variant: "BrE" }
};
const question = {
  id: "q1",
  position: 0,
  answered: false,
  content_available: true,
  prompt: { definition: "苹果", part_of_speech: "noun" },
  feedback: null
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.answer.mockReset();
  mocks.cyclePreview.mockReset();
  mocks.cycleCreate.mockReset();
  mocks.cycles.mockReset();
  mocks.plansList.mockRejectedValue(new HttpError(404, "API missing"));
  mocks.plansDetail.mockRejectedValue(new HttpError(404, "API missing"));
  mocks.user = { id: "learner-a", roles: ["student"] };
  mocks.day.mockResolvedValue({
    status: "reward_disabled",
    business_day: "2026-10-07"
  });
  mocks.run.mockResolvedValue(run);
  mocks.questions.mockResolvedValue({
    items: [question],
    pagination: { total_pages: 1 }
  });
});
it("invalidated practice explains withdrawal, preserves progress and links to restarting without an answer form", async () => {
  mocks.run.mockResolvedValue({
    ...run,
    state: "invalidated",
    answered_count: 1
  });
  mocks.questions.mockResolvedValue({
    items: [
      { ...question, answered: true, content_available: false, prompt: null }
    ],
    pagination: { total_pages: 1 }
  });
  renderWithProviders(<LearningPractice id="run" />);
  await screen.findByText(/恢复词条不会自动恢复旧轮次/);
  expect(
    screen.getByRole("link", { name: "返回任务重新开始" })
  ).toHaveAttribute("href", "/student/tasks/task");
  expect(screen.queryByLabelText("英文拼写")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "提交答案" })
  ).not.toBeInTheDocument();
  expect(mocks.answer).not.toHaveBeenCalled();
});

it("unknown answer result retains input and retries the original intent", async () => {
  mocks.questions.mockResolvedValue({
    items: [question],
    pagination: { total_pages: 2 }
  });
  mocks.answer.mockRejectedValue(new Error("offline"));
  renderWithProviders(<LearningPractice id="run" />);
  const input = await screen.findByLabelText("英文拼写");
  fireEvent.change(input, { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await screen.findByRole("button", { name: "重试原答案" });
  expect(input).toHaveValue("wrong");
  expect(input).toBeDisabled();
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  const first = mocks.answer.mock.calls[0]!;
  fireEvent.click(screen.getByRole("button", { name: "重试原答案" }));
  await waitFor(() => expect(mocks.answer).toHaveBeenCalledTimes(2));
  expect(mocks.answer.mock.calls[1]![1]).toEqual(first[1]);
});

it.each([
  { state: "expired", kind: "spelling_zh_to_en" },
  { state: "invalidated", kind: "choice_zh_to_en" }
])(
  "replays an unconfirmed $kind answer after the run becomes $state",
  async ({ state, kind }) => {
    const current = { ...run, question_type: kind };
    mocks.run.mockResolvedValue(current);
    mocks.questions.mockResolvedValue({
      items: [
        {
          ...question,
          ...(kind === "choice_zh_to_en"
            ? {
                options: [
                  { option_id: "a", spelling: "apple" },
                  { option_id: "b", spelling: "banana" },
                  { option_id: "c", spelling: "orange" },
                  { option_id: "d", spelling: "tomato" }
                ]
              }
            : {})
        }
      ],
      pagination: { total_pages: 2 }
    });
    mocks.answer
      .mockImplementationOnce(async () => {
        mocks.run.mockResolvedValue({ ...current, state });
        throw new Error("response lost");
      })
      .mockRejectedValueOnce(new HttpError(409, "本批次已不可作答"));
    renderWithProviders(<LearningPractice id="run" />);
    if (kind === "choice_zh_to_en")
      fireEvent.click(await screen.findByRole("radio", { name: "apple" }));
    else
      fireEvent.change(await screen.findByLabelText("英文拼写"), {
        target: { value: "apple" }
      });
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
    const retry = await screen.findByRole("button", { name: "重试原答案" });
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.answer).toHaveBeenCalledTimes(2));
    expect(mocks.answer.mock.calls[1]![1]).toEqual(
      mocks.answer.mock.calls[0]![1]
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "重试原答案" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();
  }
);
it("completion is server-owned and zero correct still displays completed", async () => {
  mocks.run.mockResolvedValue({
    ...run,
    state: "completed",
    answered_count: 2,
    correct_count: 0,
    completion_id: "completion"
  });
  mocks.questions.mockResolvedValue({
    items: [],
    pagination: { total_pages: 1 }
  });
  renderWithProviders(<LearningPractice id="run" />);
  expect(
    await screen.findByRole("heading", { name: "本批次已完成" })
  ).toBeInTheDocument();
  expect(screen.getByText(/正确率 0%/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "提交答案" })
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/领取|获得天生币/)).not.toBeInTheDocument();
});
it("read failure never becomes an empty successful task list", async () => {
  mocks.list.mockRejectedValue(new Error("offline"));
  renderWithProviders(<LearningTaskList />);
  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  expect(screen.queryByText(/暂无任务/)).not.toBeInTheDocument();
});
it("switching account aborts the old operation and ignores its result", async () => {
  let resolve!: (v: unknown) => void;
  mocks.answer.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const rendered = renderWithProviders(<LearningPractice id="run" />);
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await waitFor(() => expect(mocks.answer).toHaveBeenCalledOnce());
  const signal = mocks.answer.mock.calls[0]![2].signal;
  mocks.user = { id: "learner-b", roles: ["student"] };
  rendered.rerender(<LearningPractice id="run" />);
  expect(signal.aborted).toBe(true);
  resolve({});
  expect(await screen.findByLabelText("英文拼写")).toHaveValue("");
});

it("old API 404 is explicitly unavailable and does not fall back to mock tasks", async () => {
  const { HttpError } = await import("@tsz/api-client");
  mocks.list.mockRejectedValue(new HttpError(404, "not found"));
  renderWithProviders(<LearningTaskList />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "学习功能尚未就绪或该记录不存在"
  );
  expect(screen.queryByText(/暂无任务/)).not.toBeInTheDocument();
});

it("a lost response confirmed by server progress clears input before the next first answer", async () => {
  mocks.answer.mockImplementation(async () => {
    mocks.questions.mockResolvedValue({
      items: [
        { ...question, answered: true },
        { ...question, id: "q2", position: 1 }
      ],
      pagination: { total_pages: 1 }
    });
    mocks.run.mockResolvedValue({ ...run, answered_count: 1 });
    throw new Error("response lost");
  });
  renderWithProviders(<LearningPractice id="run" />);
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await screen.findByRole("heading", { name: /第 2 题/ });
  await waitFor(() =>
    expect(screen.getByLabelText("英文拼写")).toHaveValue("")
  );
  expect(screen.getByRole("button", { name: "提交答案" })).toBeDisabled();
});

it("delayed server recovery of the last answer unlocks the next page", async () => {
  mocks.run.mockResolvedValue({ ...run, target_count: 21 });
  mocks.questions.mockResolvedValue({
    items: [{ ...question, position: 19 }],
    pagination: { total_pages: 2 }
  });
  mocks.answer.mockImplementation(async () => {
    mocks.questions.mockRejectedValue(new Error("questions offline"));
    throw new Error("response lost");
  });
  renderWithProviders(<LearningPractice id="run" />);
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await screen.findByRole("button", { name: "重试" });
  mocks.questions.mockResolvedValue({
    items: [{ ...question, position: 19, answered: true }],
    pagination: { total_pages: 2 }
  });
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled()
  );
  expect(screen.queryByText(/结果未确认/)).not.toBeInTheDocument();
});
it("a background confirmation cannot submit the next question with an empty draft", async () => {
  const { QueryClient, QueryClientProvider } =
    await import("@tanstack/react-query");
  const { render, act } = await import("@testing-library/react");
  mocks.answer.mockRejectedValue(new Error("response lost"));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <LearningPractice id="run" />
    </QueryClientProvider>
  );
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await screen.findByRole("button", { name: "重试原答案" });
  await act(async () => {
    client.setQueryData(["learning", "learner-a", "questions", "run", 1], {
      items: [
        { ...question, answered: true },
        {
          ...question,
          id: "q2",
          position: 1,
          prompt: { definition: "香蕉", part_of_speech: "noun" }
        }
      ],
      pagination: { total_pages: 1 }
    });
  });
  await screen.findByRole("heading", { name: /第 2 题/ });
  expect(screen.getByLabelText("英文拼写")).toHaveValue("");
  expect(screen.getByRole("button", { name: "提交答案" })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("英文拼写").closest("form")!);
  expect(mocks.answer).toHaveBeenCalledOnce();
});

it("来源失权后仍可重试未确认的原请求，再继续同页其他合法题", async () => {
  mocks.answer
    .mockImplementationOnce(async () => {
      mocks.questions.mockResolvedValue({
        items: [
          { ...question, content_available: false, prompt: null },
          {
            ...question,
            id: "q2",
            position: 1,
            prompt: { definition: "香蕉", part_of_speech: "noun" }
          }
        ],
        pagination: { total_pages: 1 }
      });
      throw new Error("response lost");
    })
    .mockRejectedValueOnce(new HttpError(409, "来源不可用"));
  renderWithProviders(<LearningPractice id="run" />);
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  const retry = await screen.findByRole("button", { name: "重试原答案" });
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.answer).toHaveBeenCalledTimes(2));
  expect(mocks.answer.mock.calls[1]![1]).toEqual(
    mocks.answer.mock.calls[0]![1]
  );
  await waitFor(() => expect(screen.getByLabelText("英文拼写")).toBeEnabled());
  expect(screen.getByLabelText("英文拼写")).toHaveValue("");
});
it("原题全部失权且没有 next 时仍可核对未确认请求", async () => {
  mocks.answer
    .mockImplementationOnce(async () => {
      mocks.questions.mockResolvedValue({
        items: [{ ...question, content_available: false, prompt: null }],
        pagination: { total_pages: 1 }
      });
      throw new Error("response lost");
    })
    .mockResolvedValueOnce({});
  renderWithProviders(<LearningPractice id="run" />);
  fireEvent.change(await screen.findByLabelText("英文拼写"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  const retry = await screen.findByRole("button", { name: "重试原答案" });
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.answer).toHaveBeenCalledTimes(2));
  expect(mocks.answer.mock.calls[1]![1]).toEqual(
    mocks.answer.mock.calls[0]![1]
  );
});

it("定位可答题会采用刚读取的权威结果，替换目标页的未过期失权缓存", async () => {
  const { QueryClient, QueryClientProvider } =
    await import("@tanstack/react-query");
  const { render } = await import("@testing-library/react");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } }
  });
  const second = {
    ...question,
    id: "q21",
    position: 20,
    prompt: { definition: "新恢复的题目", part_of_speech: "noun" }
  };
  client.setQueryData(["learning", "learner-a", "questions", "run", 2], {
    items: [{ ...second, content_available: false, prompt: null }],
    pagination: { total_pages: 2 }
  });
  mocks.questions.mockImplementation(
    async (_id: string, q: { page: number }) => ({
      items: q.page === 2 ? [second] : [{ ...question, answered: true }],
      pagination: { total_pages: 2 }
    })
  );
  render(
    <QueryClientProvider client={client}>
      <LearningPractice id="run" />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole("button", { name: "定位可答题" }));
  expect(
    await screen.findByRole("heading", { name: /新恢复的题目/ })
  ).toBeInTheDocument();
  expect(screen.getByLabelText("英文拼写")).toBeEnabled();
});
it("历史批次的全局摘要明确标注任务当前轮次", async () => {
  mocks.plansDetail.mockResolvedValue({
    task: { id: "task" },
    current_cycle: {
      cycle_number: 2,
      covered_count: 0,
      total_count: 35,
      blocked_count: 0
    }
  });
  mocks.run.mockResolvedValue({
    ...run,
    task_type: "daily",
    business_day: "2026-10-17",
    state: "completed",
    answered_count: 2
  });
  mocks.questions.mockResolvedValue({
    items: [],
    pagination: { total_pages: 1 }
  });
  renderWithProviders(<LearningPractice id="run" />);
  expect(await screen.findByText(/任务当前第 2 轮已覆盖/)).toBeInTheDocument();
});

it("a choice task falls back to spelling for a question without options", async () => {
  mocks.run.mockResolvedValue({ ...run, question_type: "choice_zh_to_en" });
  renderWithProviders(<LearningPractice id="run" />);
  const input = await screen.findByLabelText("英文拼写");
  expect(screen.getByText(/已自动改为拼写练习/)).toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "apple" } });
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await waitFor(() => expect(mocks.answer).toHaveBeenCalledOnce());
  expect(mocks.answer.mock.calls[0]![1]).toMatchObject({
    question_id: "q1",
    answer: "apple"
  });
});
it("choice selection waits for explicit submission and renders only server-owned feedback", async () => {
  const options = [
    { option_id: "o-banana", spelling: "banana" },
    { option_id: "o-apple", spelling: "apple" },
    { option_id: "o-orange", spelling: "orange" },
    { option_id: "o-pear", spelling: "pear" }
  ];
  mocks.run.mockResolvedValue({
    ...run,
    question_type: "choice_zh_to_en",
    target_count: 1
  });
  mocks.questions.mockResolvedValue({
    items: [{ ...question, options }],
    pagination: { total_pages: 1 }
  });
  let complete!: () => void;
  mocks.answer.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = () => {
          mocks.run.mockResolvedValue({
            ...run,
            question_type: "choice_zh_to_en",
            state: "completed",
            answered_count: 1,
            target_count: 1
          });
          mocks.questions.mockResolvedValue({
            items: [
              {
                ...question,
                options,
                answered: true,
                feedback: {
                  submitted_answer: "o-banana",
                  is_correct: false,
                  accepted_answers: ["apple"],
                  correct_option_id: "o-apple",
                  explanation: "apple 表示苹果，banana 表示香蕉。"
                }
              }
            ],
            pagination: { total_pages: 1 }
          });
          resolve();
        };
      })
  );
  renderWithProviders(<LearningPractice id="run" />);
  const banana = await screen.findByRole("radio", { name: "banana" });
  expect(screen.queryByLabelText("英文拼写")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "提交答案" })).toBeDisabled();
  fireEvent.click(banana);
  expect(mocks.answer).not.toHaveBeenCalled();
  expect(screen.queryByText(/正确答案：/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  fireEvent.submit(banana.closest("form")!);
  expect(mocks.answer).toHaveBeenCalledOnce();
  expect(mocks.answer.mock.calls[0]![1]).toMatchObject({
    answer: "o-banana",
    question_id: "q1"
  });
  expect(banana).toBeDisabled();
  complete();
  await screen.findByText("apple 表示苹果，banana 表示香蕉。");
  expect(screen.getByText(/你的答案：/)).toHaveTextContent("banana");
  expect(screen.getByText(/正确答案：/)).toHaveTextContent("apple");
  expect(
    screen.queryByRole("link", { name: "查看待巩固内容与复习安排" })
  ).not.toBeInTheDocument();
});

it("mastery practice records uncertainty and restores the server retry queue", async () => {
  const current = {
    ...run,
    question_type: "choice_zh_to_en",
    practice_mode: "mastery_v1"
  };
  const options = [
    { option_id: "a", spelling: "apple" },
    { option_id: "b", spelling: "banana" },
    { option_id: "c", spelling: "orange" },
    { option_id: "d", spelling: "tomato" }
  ];
  mocks.run.mockResolvedValue(current);
  mocks.questions.mockResolvedValue({
    items: [{ ...question, options }],
    pagination: { total_pages: 1 }
  });
  mocks.answer.mockImplementation(async () => {
    mocks.run.mockResolvedValue({
      ...current,
      target_count: 3,
      answered_count: 1
    });
    mocks.questions.mockResolvedValue({
      items: [
        {
          ...question,
          options,
          answered: true,
          feedback: {
            submitted_answer: "不确定",
            is_correct: false,
            accepted_answers: ["apple"]
          }
        },
        {
          ...question,
          id: "retry",
          position: 2,
          practice_kind: "retry",
          options
        }
      ],
      pagination: { total_pages: 1 }
    });
  });
  renderWithProviders(<LearningPractice id="run" />);
  fireEvent.click(await screen.findByRole("button", { name: "不确定" }));
  await waitFor(() => expect(mocks.answer).toHaveBeenCalledOnce());
  expect(mocks.answer.mock.calls[0]![1]).toMatchObject({
    question_id: "q1",
    answer: "不确定"
  });
  await screen.findByText(/错题重练/);
  expect(screen.getByText(/已答 1\/3 题/)).toBeInTheDocument();
  expect(screen.getByText(/你的答案：/)).toHaveTextContent("不确定");
});

function sourceRepairPlan(): LearningPlan {
  return {
    mode: "mastery_v1",
    task: {
      id: "task",
      name: "来源恢复",
      task_type: "longterm",
      wordlist_ids: ["list"],
      daily_question_count: null,
      ends_at: null,
      state: "active",
      revision: 3,
      created_at: "2026-10-30T00:00:00Z"
    },
    schedule: null,
    sources: [],
    current_cycle: {
      id: "cycle",
      cycle_number: 1,
      state: "active",
      total_count: 4,
      covered_count: 1,
      remaining_count: 3,
      available_remaining_count: 0,
      blocked_count: 3,
      earliest_day: "2026-10-30",
      created_at: "2026-10-30T00:00:00Z",
      completed_at: null
    },
    current_run: null,
    mastery: {
      new_count: 3,
      learning_count: 0,
      mastered_count: 1,
      due_count: 0,
      next_review_day: null
    },
    today_available_count: 0,
    estimated_learning_days: null,
    estimate_from_day: null,
    schedule_at_risk: false,
    status: "source_blocked",
    can_start: false,
    can_start_next_cycle: false,
    can_restart_blocked_cycle: false,
    reasons: [],
    server_time: "2026-10-30T00:00:00Z",
    business_day: "2026-10-30",
    next_day_at: "2026-10-30T20:00:00Z",
    timezone: "Asia/Shanghai"
  };
}
function sourceRepairPreview(available = true) {
  return {
    source_refresh: {
      refreshed_count: available ? 3 : 0,
      changed_content_count: 1,
      unavailable_count: available ? 1 : 4
    },
    preview: {
      eligible_count: available ? 3 : 0,
      can_create: available,
      reasons: available ? [] : ["来源尚未恢复"],
      preview_fingerprint: "source-fingerprint"
    },
    earliest_day: "2026-10-30",
    previous_covered_count: 1,
    previous_total_count: 4,
    previous_blocked_count: 3
  };
}
function enableSourceDialog() {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
}
it("source refresh requires confirmation and retries unknown results with the same intent", async () => {
  enableSourceDialog();
  mocks.cyclePreview.mockResolvedValue(sourceRepairPreview());
  mocks.cycleCreate
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({ id: "cycle" });
  const refresh = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <PlanCoverage
      plan={sourceRepairPlan()}
      userId="learner-a"
      refresh={refresh}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "刷新学习安排" }));
  expect(mocks.cyclePreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重新确认来源" }));
  await screen.findByRole("dialog", { name: "重新确认来源" });
  expect(mocks.cyclePreview).toHaveBeenCalledWith(
    "task",
    {
      operation: "refresh_sources",
      after_cycle_id: "cycle",
      expected_revision: 3
    },
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(mocks.cycleCreate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认更新来源" }));
  const retry = await screen.findByRole("button", { name: "重试原请求" });
  expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
  const intent = mocks.cycleCreate.mock.calls[0]![1];
  expect(intent).toMatchObject({
    operation: "refresh_sources",
    after_cycle_id: "cycle",
    expected_revision: 3,
    preview_fingerprint: "source-fingerprint"
  });
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.cycleCreate).toHaveBeenCalledTimes(2));
  expect(mocks.cycleCreate.mock.calls[1]![1]).toEqual(intent);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("revoked sources remain unconfirmable rather than silently renewing access", async () => {
  enableSourceDialog();
  mocks.cyclePreview.mockResolvedValue(sourceRepairPreview(false));
  renderWithProviders(
    <PlanCoverage
      plan={sourceRepairPlan()}
      userId="learner-a"
      refresh={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "重新确认来源" }));
  const dialog = await screen.findByRole("dialog", { name: "重新确认来源" });
  expect(within(dialog).getByText("来源尚未恢复")).toBeInTheDocument();
  expect(
    await within(dialog).findByRole("button", { name: "确认更新来源" })
  ).toBeDisabled();
  expect(mocks.cycleCreate).not.toHaveBeenCalled();
});
it("existing coverage cycle confirmation keeps its original operation", async () => {
  enableSourceDialog();
  const plan = sourceRepairPlan();
  plan.mode = "coverage_v1";
  delete plan.mastery;
  plan.can_start_next_cycle = true;
  mocks.cycles.mockResolvedValue({ items: [], pagination: { total_pages: 1 } });
  mocks.cyclePreview.mockResolvedValue({
    ...sourceRepairPreview(),
    source_refresh: undefined
  });
  mocks.cycleCreate.mockResolvedValue({ id: "new-cycle" });
  renderWithProviders(
    <PlanCoverage plan={plan} userId="learner-a" refresh={vi.fn()} />
  );
  fireEvent.click(screen.getByRole("button", { name: "开启下一轮" }));
  await screen.findByRole("dialog", { name: "开启下一轮" });
  fireEvent.click(screen.getByRole("button", { name: "确认开启新轮" }));
  await waitFor(() => expect(mocks.cycleCreate).toHaveBeenCalledOnce());
  expect(mocks.cycleCreate.mock.calls[0]![1]).toMatchObject({
    operation: "next",
    after_cycle_id: "cycle"
  });
});
