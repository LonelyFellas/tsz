import { screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  questions: vi.fn(),
  answer: vi.fn(),
  list: vi.fn(),
  user: { id: "learner-a", roles: ["student"] }
}));
vi.mock("@/lib/request", () => ({ api: { learning: mocks } }));
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
  mocks.user = { id: "learner-a", roles: ["student"] };
  mocks.run.mockResolvedValue(run);
  mocks.questions.mockResolvedValue({
    items: [question],
    pagination: { total_pages: 1 }
  });
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
    await screen.findByRole("heading", { name: "本轮已完成" })
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
it("a background question advance cannot submit the previous question's draft", async () => {
  const { QueryClient, QueryClientProvider } =
    await import("@tanstack/react-query");
  const { render, act } = await import("@testing-library/react");
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
  expect(mocks.answer).not.toHaveBeenCalled();
});
