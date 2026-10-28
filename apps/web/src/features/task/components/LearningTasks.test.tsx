import { HttpError } from "@tsz/api-client";
import { screen, fireEvent, waitFor } from "@testing-library/react";
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
  user: { id: "learner-a", roles: ["student"] }
}));
vi.mock("@/lib/request", () => ({
  api: {
    learning: mocks,
    learningPlans: { list: mocks.plansList, detail: mocks.plansDetail },
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
