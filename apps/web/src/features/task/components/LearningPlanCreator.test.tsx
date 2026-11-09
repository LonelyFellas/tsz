import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, it, expect, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { renderWithProviders } from "@/test/render";
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  capabilities: vi.fn(),
  create: vi.fn(),
  start: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  myDetail: vi.fn(),
  push: vi.fn(),
  user: { id: "learner", roles: ["student"] }
}));
vi.mock("@/lib/request", () => ({
  api: {
    learning: { capabilities: mocks.capabilities },
    learningPlans: {
      preview: mocks.preview,
      create: mocks.create,
      start: mocks.start,
      detail: mocks.detail
    },
    wordList: {
      get: mocks.get,
      myDetail: mocks.myDetail,
      library: { list: mocks.list }
    }
  }
}));
vi.mock("@/stores/user", () => ({
  useUserStore: Object.assign(
    (f: (s: unknown) => unknown) => f({ user: mocks.user }),
    { getState: () => ({ user: mocks.user }) }
  )
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
import { LearningPlanCreator } from "./LearningPlanCreator";
import { LearningTaskCreator } from "./LearningTasks";
const wordlist = {
  id: "list",
  name: "原词表",
  owner_name: "作者",
  state: "published",
  item_count: 35
};
const preview = {
  entry_count: 35,
  eligible_count: 35,
  custom_word_count: 0,
  exclusions: {
    unavailable_entries: 0,
    context_dependent: 0,
    no_chinese_definition: 0,
    no_base_form: 0,
    answer_in_prompt: 0
  },
  settings: { cefr_level: "A1", english_variant: "BrE" },
  estimated_learning_days: 4,
  can_create: true,
  reasons: [],
  preview_fingerprint: "fingerprint"
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(
    new Date("2026-11-02T04:00:00Z").getTime()
  );
  mocks.user = { id: "learner", roles: ["student"] };
  mocks.get.mockResolvedValue(wordlist);
  mocks.myDetail.mockResolvedValue({ ...wordlist, state: "draft" });
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
    choice_policies: ["strict_tiered_v1", "mixed_tiered_v1"],
    practice_features: ["mixed_types_v1", "resume_wordlist_v1"]
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mocks.preview.mockResolvedValue(preview);
  mocks.create.mockResolvedValue({ task: { id: "created", revision: 1 } });
  mocks.start.mockResolvedValue({ id: "run" });
  mocks.detail.mockResolvedValue({ task: { id: "created", revision: 2 } });
  mocks.list.mockResolvedValue({
    version: "v1",
    ancestors: [],
    items: [{ id: "node", wordlist_id: "list", name: "我的备注", wordlist }],
    pagination: { total_pages: 1 }
  });
});
async function choose() {
  fireEvent.click(screen.getByRole("button", { name: /选择词表/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(await within(dialog).findByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "确认选择" }));
  await screen.findByText("可练习 35 项内容");
}
function openDates() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /(?:不限日期|[0-9]{4}\/).*?(?:设置|更改)/
    })
  );
  return screen.getByRole("dialog", { name: "选择起止日期" });
}
function selectDates(start: string, end: string) {
  const dialog = openDates();
  const month = (day: string) =>
    `${day.slice(0, 4)}年${Number(day.slice(5, 7))}月`;
  const label = (day: string) => `${month(day)}${Number(day.slice(8))}日`;
  function go(day: string) {
    // Tests use dates close to the controlled 2026-11 fixture month.
    for (
      let i = 0;
      !within(dialog).queryByRole("button", { name: label(day) }) && i < 3;
      i++
    ) {
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: day < "2026-11-01" ? "上个月" : "下个月"
        })
      );
    }
    fireEvent.click(within(dialog).getByRole("button", { name: label(day) }));
  }
  go(start);
  go(end);
  fireEvent.click(within(dialog).getByRole("button", { name: "应用日期" }));
}
it("fills a task name from the first selected source without replacing a learner's draft", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await choose();
  expect(screen.getByLabelText("任务名称")).toHaveValue("原词表练习");
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  expect(screen.getByLabelText("任务名称")).not.toHaveAttribute("readonly");
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "我的复习" }
  });
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  fireEvent.click(screen.getByRole("button", { name: "移除 原词表" }));
  await choose();
  expect(screen.getByLabelText("任务名称")).toHaveValue("我的复习");
});
it("restores selected practice types on reload before requesting a preview", async () => {
  sessionStorage.setItem(
    "wordlist-practice-types:learner:list",
    JSON.stringify(["spelling_zh_to_en", "choice_zh_to_en"])
  );
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByText("可练习 35 项内容");
  expect(
    screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
  ).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  ).toBeChecked();
  expect(mocks.preview).toHaveBeenCalledOnce();
  expect(mocks.preview.mock.lastCall![0]).toHaveProperty(
    "choice_policy",
    "mixed_tiered_v1"
  );
});
it("opens the reused active run and keeps its saved progress without starting a new batch", async () => {
  mocks.create.mockResolvedValue({
    task: { id: "existing", revision: 3 },
    current_run: { id: "saved-run", state: "active", answered_count: 1 },
    can_start: true
  });
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/practice/saved-run")
  );
  expect(mocks.create.mock.lastCall![0]).toHaveProperty("reuse_active", true);
  expect(mocks.start).not.toHaveBeenCalled();
});
it("opens the saved task's next review schedule when no new batch is due", async () => {
  mocks.create.mockResolvedValue({
    task: { id: "existing", revision: 3 },
    current_run: { id: "completed", state: "completed" },
    can_start: false,
    status: "review_waiting"
  });
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/tasks/existing")
  );
  expect(mocks.start).not.toHaveBeenCalled();
});
it("does not silently create a new direct practice against an old backend without reuse support", async () => {
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
    choice_policies: ["strict_tiered_v1"]
  });
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "开始练习" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "我的任务" })).toHaveAttribute(
    "href",
    "/student/practice"
  );
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("an old backend keeps single-type tasks available but does not accept an unsupported combination", async () => {
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
    choice_policies: ["strict_tiered_v1"]
  });
  renderWithProviders(<LearningTaskCreator wordlistId="list" owned />);
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "创建任务" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
  );
  expect(mocks.preview.mock.lastCall![0]).toHaveProperty(
    "choice_policy",
    "strict_tiered_v1"
  );
});
it("clears cached capabilities on a legacy 404 and lets the learner remove an unsupported selected type", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <LearningTaskCreator wordlistId="list" owned />
    </QueryClientProvider>
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
  );
  mocks.capabilities.mockRejectedValueOnce(new HttpError(404, "old API"));
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["learning", "learner", "capabilities"]
    });
  });
  await screen.findByRole("alert");
  const choice = screen.getByRole("checkbox", {
    name: "单选 看中文，选英文"
  });
  expect(choice).toBeChecked();
  expect(choice).toBeEnabled();
  expect(screen.getByRole("button", { name: "创建任务" })).toBeDisabled();
  fireEvent.click(choice);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
  );
  expect(mocks.preview.mock.lastCall![0]).not.toHaveProperty("question_type");
  expect(mocks.preview.mock.lastCall![0]).not.toHaveProperty("practice_mode");
});
it.each([false, true])(
  "blocks task creation after a capability request failure with directPractice=%s",
  async (directPractice) => {
    mocks.capabilities.mockRejectedValueOnce(
      new HttpError(503, "temporarily unavailable")
    );
    renderWithProviders(
      <LearningTaskCreator
        wordlistId="list"
        owned
        directPractice={directPractice}
      />
    );
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", {
        name: directPractice ? "开始练习" : "创建任务"
      })
    ).toBeDisabled();
    expect(mocks.preview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重新加载练习选项" }));
    await screen.findByText("可练习 35 项内容");
    expect(
      screen.getByRole("button", {
        name: directPractice ? "开始练习" : "创建任务"
      })
    ).toBeEnabled();
  }
);
it("refreshes the saved task revision after a definite start conflict", async () => {
  mocks.start.mockImplementation(async (_id, input) => {
    if (input.expected_revision !== 2)
      throw new HttpError(409, "任务版本已变化");
    return { id: "run" };
  });
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "重试开始练习" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/practice/run")
  );
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.detail).toHaveBeenCalledWith("created", {
    signal: expect.any(AbortSignal)
  });
  expect(mocks.start.mock.calls[1]![1]).toMatchObject({ expected_revision: 2 });
  expect(mocks.start.mock.calls[1]![1].idempotency_key).not.toBe(
    mocks.start.mock.calls[0]![1].idempotency_key
  );
});
it.each([
  [false, "spelling_zh_to_en"],
  [true, "spelling_zh_to_en"],
  [false, "choice_zh_to_en"],
  [true, "choice_zh_to_en"]
] as const)(
  "starts direct wordlist practice with owned=%s and question type %s",
  async (owned, questionType) => {
    mocks.capabilities.mockResolvedValue({
      question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
      choice_policies: ["strict_tiered_v1", "mixed_tiered_v1"],
      practice_features: ["mixed_types_v1", "resume_wordlist_v1"],
      practice_modes: ["mastery_v1"]
    });
    renderWithProviders(
      <LearningTaskCreator wordlistId="list" owned={owned} directPractice />
    );
    await screen.findByText("可练习 35 项内容");
    expect(owned ? mocks.myDetail : mocks.get).toHaveBeenCalledWith("list", {
      signal: expect.any(AbortSignal)
    });
    expect(screen.getByRole("heading", { name: "原词表" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回词表" })).toHaveAttribute(
      "href",
      `${owned ? "/account" : ""}/wordlists/list`
    );
    expect(screen.queryByLabelText("任务名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("每日题量")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /选择词表/ })
    ).not.toBeInTheDocument();
    if (questionType === "choice_zh_to_en") {
      const choice = screen.getByRole("checkbox", {
        name: "单选 看中文，选英文"
      });
      await waitFor(() => expect(choice).toBeEnabled());
      fireEvent.click(choice);
      fireEvent.click(
        screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
      );
    }
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "开始练习" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/student/practice/run")
    );
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      wordlist_ids: ["list"],
      task_type: "longterm",
      daily_question_count: null,
      schedule: null,
      name: "原词表练习",
      preview_fingerprint: "fingerprint"
    });
    expect(mocks.create.mock.calls[0]![0]).toHaveProperty(
      "practice_mode",
      "mastery_v1"
    );
    if (questionType === "choice_zh_to_en") {
      expect(mocks.create.mock.calls[0]![0]).toMatchObject({
        question_type: questionType,
        choice_policy: "strict_tiered_v1"
      });
    } else {
      expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty(
        "question_type"
      );
    }
    expect(mocks.start).toHaveBeenCalledWith(
      "created",
      {
        expected_revision: 1,
        after_run_id: null,
        idempotency_key: expect.any(String)
      },
      { signal: expect.any(AbortSignal) }
    );
    expect(mocks.list).not.toHaveBeenCalled();
  }
);
it("retries an uncertain direct-practice creation with the same request", async () => {
  mocks.create.mockRejectedValueOnce(new Error("network interrupted"));
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
  await screen.findByRole("alert");
  expect(mocks.start).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: /拼写/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试开始练习" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/practice/run")
  );
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.create.mock.calls[1]![0]).toEqual(
    mocks.create.mock.calls[0]![0]
  );
});
it.each([new Error("network interrupted"), new HttpError(409, "词表已变化")])(
  "retries a saved direct practice without recreating it after %s",
  async (error) => {
    mocks.start.mockRejectedValueOnce(error);
    renderWithProviders(
      <LearningTaskCreator wordlistId="list" owned directPractice />
    );
    await screen.findByText("可练习 35 项内容");
    fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("link", { name: "查看已保存的练习" })
    ).toHaveAttribute("href", "/student/tasks/created");
    expect(screen.getByRole("checkbox", { name: /单选/ })).toBeDisabled();
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重试开始练习" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/student/practice/run")
    );
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledTimes(2);
    if (error instanceof HttpError) {
      expect(mocks.start.mock.calls[1]![1].expected_revision).toBe(2);
      expect(mocks.start.mock.calls[1]![1].idempotency_key).not.toBe(
        mocks.start.mock.calls[0]![1].idempotency_key
      );
    } else {
      expect(mocks.start.mock.calls[1]![1]).toEqual(
        mocks.start.mock.calls[0]![1]
      );
    }
  }
);
it("does not start or navigate after the account changes during direct-practice creation", async () => {
  let finish!: (value: unknown) => void;
  mocks.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  mocks.user = { id: "other", roles: ["student"] };
  await act(async () => finish({ task: { id: "created", revision: 1 } }));
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});
it("keeps both practice types selected and uses the existing mixed mastery algorithm", async () => {
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
    choice_policies: ["strict_tiered_v1", "mixed_tiered_v1"],
    practice_features: ["mixed_types_v1", "resume_wordlist_v1"],
    practice_modes: ["mastery_v1"]
  });
  mocks.preview.mockImplementation(async (input) =>
    input.choice_policy === "strict_tiered_v1"
      ? {
          ...preview,
          eligible_count: 0,
          can_create: false,
          reasons: ["没有可用单选题"]
        }
      : preview
  );
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByText("可练习 35 项内容");
  const spelling = screen.getByRole("checkbox", {
    name: "拼写 看中文，写英文"
  });
  const choice = screen.getByRole("checkbox", {
    name: "单选 看中文，选英文"
  });
  await waitFor(() => expect(choice).toBeEnabled());
  fireEvent.click(choice);
  expect(spelling).toBeChecked();
  expect(choice).toBeChecked();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "开始练习" })).toBeEnabled()
  );
  expect(mocks.preview.mock.lastCall![0]).toMatchObject({
    wordlist_ids: ["list"],
    question_type: "choice_zh_to_en",
    practice_mode: "mastery_v1"
  });
  expect(mocks.preview.mock.lastCall![0]).toHaveProperty(
    "choice_policy",
    "mixed_tiered_v1"
  );
  fireEvent.click(spelling);
  await screen.findByText("没有可用单选题");
  expect(screen.getByRole("button", { name: "开始练习" })).toBeDisabled();
  expect(mocks.preview.mock.lastCall![0]).toHaveProperty(
    "choice_policy",
    "strict_tiered_v1"
  );
  fireEvent.click(spelling);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "开始练习" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "开始练习" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/practice/run")
  );
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.create.mock.lastCall![0]).toMatchObject({
    wordlist_ids: ["list"],
    question_type: "choice_zh_to_en",
    practice_mode: "mastery_v1"
  });
  expect(mocks.create.mock.lastCall![0]).toHaveProperty(
    "choice_policy",
    "mixed_tiered_v1"
  );
});
it("waits for practice capabilities before previewing so a slow response cannot bypass mastery", async () => {
  let finish!: (value: unknown) => void;
  mocks.capabilities.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned directPractice />
  );
  await screen.findByRole("heading", { name: "原词表" });
  expect(screen.getByRole("button", { name: "开始练习" })).toBeDisabled();
  expect(mocks.preview).not.toHaveBeenCalled();
  await act(async () =>
    finish({
      question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
      choice_policies: ["strict_tiered_v1", "mixed_tiered_v1"],
      practice_features: ["mixed_types_v1", "resume_wordlist_v1"],
      practice_modes: ["mastery_v1"]
    })
  );
  await screen.findByText("可练习 35 项内容");
  expect(mocks.preview).toHaveBeenCalledOnce();
  expect(mocks.preview.mock.lastCall![0]).toHaveProperty(
    "practice_mode",
    "mastery_v1"
  );
});
it.each(["direct", "daily", "longterm"] as const)(
  "requires at least one question type for %s practice",
  async (kind) => {
    renderWithProviders(
      <LearningTaskCreator
        wordlistId="list"
        owned
        directPractice={kind === "direct"}
      />
    );
    await screen.findByText("可练习 35 项内容");
    if (kind === "longterm") {
      fireEvent.click(screen.getByRole("button", { name: "长期任务" }));
    }
    const submitLabel = kind === "direct" ? "开始练习" : "创建任务";
    fireEvent.click(
      screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
    );
    expect(screen.getByText("请至少选择一种练习题型。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: submitLabel })).toBeDisabled();
    fireEvent.submit(
      screen.getByRole("button", { name: submitLabel }).closest("form")!
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: submitLabel })).toBeEnabled()
    );
    expect(
      screen.queryByText("请至少选择一种练习题型。")
    ).not.toBeInTheDocument();
  }
);
it.each(["daily", "longterm"] as const)(
  "preserves both question types through task type changes, preview and creation for %s tasks",
  async (kind) => {
    renderWithProviders(<LearningTaskCreator wordlistId="list" owned />);
    await screen.findByText("可练习 35 项内容");
    const spelling = screen.getByRole("checkbox", {
      name: "拼写 看中文，写英文"
    });
    const choice = screen.getByRole("checkbox", {
      name: "单选 看中文，选英文"
    });
    await waitFor(() => expect(choice).toBeEnabled());
    fireEvent.click(choice);
    fireEvent.change(screen.getByLabelText("每日题量"), {
      target: { value: "15" }
    });
    fireEvent.click(screen.getByRole("button", { name: "长期任务" }));
    fireEvent.click(screen.getByRole("button", { name: "每日任务" }));
    if (kind === "longterm")
      fireEvent.click(screen.getByRole("button", { name: "长期任务" }));
    expect(spelling).toBeChecked();
    expect(choice).toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
    );
    const expected = {
      task_type: kind,
      wordlist_ids: ["list"],
      daily_question_count: kind === "daily" ? 15 : null,
      schedule: null,
      question_type: "choice_zh_to_en"
    };
    expect(mocks.preview.mock.lastCall![0]).toMatchObject(expected);
    expect(mocks.preview.mock.lastCall![0]).toHaveProperty(
      "choice_policy",
      "mixed_tiered_v1"
    );
    fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.lastCall![0]).toMatchObject(expected);
    expect(mocks.create.mock.lastCall![0]).toHaveProperty(
      "choice_policy",
      "mixed_tiered_v1"
    );
    expect(mocks.push).toHaveBeenCalledWith("/student/tasks/created");
    expect(mocks.start).not.toHaveBeenCalled();
  }
);
it.each([false, true])(
  "preselects the current wordlist with owned=%s and creates without opening the picker",
  async (owned) => {
    renderWithProviders(
      <LearningTaskCreator wordlistId="list" owned={owned} />
    );
    await screen.findByText("可练习 35 项内容");
    expect(owned ? mocks.myDetail : mocks.get).toHaveBeenCalledWith("list", {
      signal: expect.any(AbortSignal)
    });
    expect(owned ? mocks.get : mocks.myDetail).not.toHaveBeenCalled();
    expect(screen.getByLabelText("任务名称")).toHaveValue("原词表练习");
    expect(
      screen.getByRole("button", { name: "更换词表（1/5）" })
    ).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ wordlist_ids: ["list"] }),
      { signal: expect.any(AbortSignal) }
    );
    fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      wordlist_ids: ["list"],
      name: "原词表练习"
    });
  }
);
it("does not restore a preselected source after the learner removes it", async () => {
  renderWithProviders(<LearningTaskCreator wordlistId="list" owned />);
  await screen.findByText("可练习 35 项内容");
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "我的计划" }
  });
  fireEvent.click(screen.getByRole("button", { name: "移除 原词表" }));
  expect(screen.getByRole("button", { name: "选择词表" })).toBeInTheDocument();
  expect(screen.getByLabelText("任务名称")).toHaveValue("我的计划");
  expect(screen.getByRole("button", { name: "创建任务" })).toBeDisabled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("preserves the draft through a failed source refresh and retry, blocking creation until recovery", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <LearningTaskCreator wordlistId="list" owned />
    </QueryClientProvider>
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "用户已编辑的任务名" }
  });
  fireEvent.change(screen.getByLabelText("每日题量"), {
    target: { value: "15" }
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  );
  selectDates("2026-11-01", "2026-11-10");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
  );
  mocks.myDetail.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await client.refetchQueries({ queryKey: ["learning-plan-source"] });
  });
  await screen.findByRole("alert");
  expect(screen.getByLabelText("任务名称")).toHaveValue("用户已编辑的任务名");
  expect(screen.getByLabelText("每日题量")).toHaveValue(15);
  expect(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  ).toBeChecked();
  expect(
    screen.getByRole("button", { name: /2026\/11\/01 — 2026\/11\/10 更改/ })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "更换词表（1/5）" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "创建任务" })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("任务名称").closest("form")!);
  expect(mocks.create).not.toHaveBeenCalled();

  let finish!: (value: unknown) => void;
  mocks.myDetail.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(mocks.myDetail).toHaveBeenCalledTimes(3));
  expect(screen.getByLabelText("任务名称")).toHaveValue("用户已编辑的任务名");
  expect(screen.getByRole("button", { name: "创建任务" })).toBeDisabled();
  await act(async () =>
    finish({ ...wordlist, name: "刷新后的词表名", state: "draft" })
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
  );
  expect(screen.getByLabelText("任务名称")).toHaveValue("用户已编辑的任务名");
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({
    name: "用户已编辑的任务名",
    wordlist_ids: ["list"],
    daily_question_count: 15,
    question_type: "choice_zh_to_en",
    schedule: { start_date: "2026-11-01", end_date: "2026-11-10" }
  });
});
it("blocks an inaccessible preselected wordlist and allows retry without creating a task", async () => {
  mocks.myDetail.mockRejectedValueOnce(new HttpError(404, "不存在"));
  renderWithProviders(<LearningTaskCreator wordlistId="list" owned />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "词表不存在、不可访问或暂时无法加载。"
  );
  expect(screen.getByRole("link", { name: "重新选择词表" })).toHaveAttribute(
    "href",
    "/student/tasks/new"
  );
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText("可练习 35 项内容");
  expect(screen.getByLabelText("任务名称")).toHaveValue("原词表练习");
});
it("allows replacing an unavailable source without discarding the draft", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <LearningTaskCreator wordlistId="list" owned />
    </QueryClientProvider>
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "更换来源的计划" }
  });
  mocks.myDetail.mockRejectedValueOnce(new HttpError(404, "不可访问"));
  await act(async () => {
    await client.refetchQueries({ queryKey: ["learning-plan-source"] });
  });
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "移除 原词表" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("任务名称")).toHaveValue("更换来源的计划");
  mocks.list.mockResolvedValue({
    version: "v1",
    ancestors: [],
    items: [
      {
        id: "replacement-node",
        wordlist_id: "replacement",
        name: "替代词表",
        wordlist: { ...wordlist, id: "replacement", name: "替代词表" }
      }
    ],
    pagination: { total_pages: 1 }
  });
  await choose();
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({
    name: "更换来源的计划",
    wordlist_ids: ["replacement"]
  });
});
it("retains an uncertain creation request through a source refresh failure", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  mocks.create.mockRejectedValueOnce(new Error("offline"));
  render(
    <QueryClientProvider client={client}>
      <LearningTaskCreator wordlistId="list" owned />
    </QueryClientProvider>
  );
  await screen.findByText("可练习 35 项内容");
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await screen.findByRole("button", { name: "重试原创建请求" });
  const original = mocks.create.mock.calls[0]![0];
  mocks.myDetail.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await client.refetchQueries({ queryKey: ["learning-plan-source"] });
  });
  await screen.findByText(/暂时无法确认词表是否可用/);
  expect(screen.getByLabelText("任务名称")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原创建请求" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(mocks.create.mock.calls[1]![0]).toEqual(original);
});
it("rechecks the current account before reusing a private source", async () => {
  const view = renderWithProviders(
    <LearningTaskCreator wordlistId="list" owned />
  );
  await screen.findByText("可练习 35 项内容");
  mocks.myDetail.mockRejectedValue(new HttpError(404, "不可访问"));
  mocks.user = { id: "another-learner", roles: ["student"] };
  view.rerender(<LearningTaskCreator wordlistId="list" owned />);
  await screen.findByRole("alert");
  expect(mocks.myDetail).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText("任务名称")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "移除 原词表" })
  ).not.toBeInTheDocument();
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.myDetail.mockResolvedValue({ ...wordlist, state: "draft" });
});
it.each(["201", "0", "1.5", ""])(
  "daily quota %s links its error to the input and clears it after correction",
  (value) => {
    renderWithProviders(<LearningPlanCreator userId="learner" />);
    const count = screen.getByLabelText("每日题量");
    fireEvent.change(count, { target: { value } });
    expect(count).toHaveAttribute("aria-invalid", "true");
    expect(count).toHaveAccessibleDescription("每日题量须为 1–200 的整数。");
    fireEvent.submit(count.closest("form")!);
    fireEvent.change(count, { target: { value: "200" } });
    expect(count).toHaveAttribute("aria-invalid", "false");
    expect(count).toHaveAccessibleDescription(
      "每天 1–200 题；本轮不足一天时只做剩余题量。"
    );
    expect(
      screen.queryByText("每日题量须为 1–200 的整数。")
    ).not.toBeInTheDocument();
  }
);
it("submitted name and source errors clear as corrected and focus the next invalid field", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  const name = screen.getByLabelText("任务名称");
  const sources = screen.getByRole("button", { name: /选择词表/ });
  expect(name).toHaveAttribute("aria-invalid", "false");
  expect(sources).toHaveAttribute("aria-invalid", "false");
  fireEvent.submit(name.closest("form")!);
  expect(name).toHaveAccessibleDescription("请输入 1–50 字的任务名称。");
  expect(sources).toHaveAccessibleDescription("请选择 1–5 份词表。");
  await waitFor(() => expect(sources).toHaveFocus());
  fireEvent.change(name, { target: { value: "  每日拼写  " } });
  expect(name).toHaveAttribute("aria-invalid", "false");
  expect(
    screen.queryByText("请输入 1–50 字的任务名称。")
  ).not.toBeInTheDocument();
  fireEvent.submit(name.closest("form")!);
  await waitFor(() => expect(sources).toHaveFocus());
  await choose();
  expect(sources).toHaveAttribute("aria-invalid", "false");
  expect(sources).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByText("请选择 1–5 份词表。")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/tasks/created")
  );
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({ name: "每日拼写" });
});
it("keeps date drafts local until a complete range is applied and preserves the old range on cancel", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await choose();
  mocks.preview.mockClear();
  let dialog = openDates();
  expect(
    within(dialog).getByRole("button", { name: "应用日期" })
  ).toBeDisabled();
  expect(dialog.querySelector('[aria-invalid="true"]')).toBeNull();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "2026年11月2日" })
  );
  expect(
    within(dialog).getByRole("button", { name: "应用日期" })
  ).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(mocks.preview).not.toHaveBeenCalled();
  selectDates("2026-11-02", "2026-11-05");
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schedule: { start_date: "2026-11-02", end_date: "2026-11-05" }
      }),
      expect.anything()
    )
  );
  dialog = openDates();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "2026年11月10日" })
  );
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
  expect(
    screen.getByRole("button", { name: /2026\/11\/02 — 2026\/11\/05 更改/ })
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({
    daily_question_count: 10,
    schedule: { start_date: "2026-11-02", end_date: "2026-11-05" }
  });
});
it.each(["clear dates", "longterm"])(
  "%s omits the schedule without discarding other settings",
  async (action) => {
    renderWithProviders(<LearningPlanCreator userId="learner" />);
    await choose();
    selectDates("2026-11-02", "2026-11-05");
    if (action === "clear dates")
      fireEvent.click(screen.getByRole("button", { name: "清除日期" }));
    else {
      fireEvent.change(screen.getByLabelText("每日题量"), {
        target: { value: "201" }
      });
      fireEvent.click(screen.getByRole("button", { name: "长期任务" }));
    }
    await waitFor(() =>
      expect(mocks.preview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          schedule: null,
          task_type: action === "longterm" ? "longterm" : "daily"
        }),
        expect.anything()
      )
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "创建任务" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      schedule: null,
      daily_question_count: action === "longterm" ? null : 10
    });
  }
);
it("unknown creation freezes the original intent and retains its key on retry", async () => {
  mocks.create.mockRejectedValue(new Error("offline"));
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "每日拼写" }
  });
  await choose();
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await screen.findByRole("button", { name: "重试原创建请求" });
  expect(screen.getByLabelText("任务名称")).toBeDisabled();
  const first = mocks.create.mock.calls[0]![0];
  fireEvent.click(screen.getByRole("button", { name: "重试原创建请求" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(mocks.create.mock.calls[1]![0]).toEqual(first);
});
it("switching to longterm omits daily quota and scheduled draft dates", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await choose();
  selectDates("2026-10-20", "2026-11-20");
  fireEvent.click(screen.getByRole("button", { name: "长期任务" }));
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenLastCalledWith(
      {
        task_type: "longterm",
        wordlist_ids: ["list"],
        daily_question_count: null,
        schedule: null
      },
      expect.anything()
    )
  );
  expect(screen.queryByLabelText("每日题量")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "每日任务" }));
  expect(screen.getByLabelText("每日题量")).toHaveValue(10);
  expect(
    screen.getByRole("button", { name: /2026\/10\/20 — 2026\/11\/20 更改/ })
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        task_type: "daily",
        daily_question_count: 10,
        schedule: { start_date: "2026-10-20", end_date: "2026-11-20" }
      }),
      expect.anything()
    )
  );
});
it("late preview cannot replace the latest quota calculation and missing name focuses its field", async () => {
  let finish!: (v: unknown) => void;
  mocks.preview.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      })
  );
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  fireEvent.click(screen.getByRole("button", { name: /选择词表/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(await within(dialog).findByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "确认选择" }));
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
  mocks.preview.mockResolvedValue({ ...preview, eligible_count: 22 });
  fireEvent.change(screen.getByLabelText("每日题量"), {
    target: { value: "11" }
  });
  await screen.findByText("可练习 22 项内容");
  finish(preview);
  await waitFor(() =>
    expect(screen.queryByText("可练习 35 项内容")).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "" }
  });
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await screen.findByText("请输入 1–50 字的任务名称。");
  await waitFor(() => expect(screen.getByLabelText("任务名称")).toHaveFocus());
  expect(mocks.create).not.toHaveBeenCalled();
});

it("choice creation previews the selected type and preserves it through the create request", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  const choice = await screen.findByRole("checkbox", {
    name: "单选 看中文，选英文"
  });
  await waitFor(() => expect(choice).toBeEnabled());
  fireEvent.click(choice);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
  );
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "中文单选" }
  });
  await choose();
  expect(mocks.preview.mock.calls.at(-1)![0]).toMatchObject({
    question_type: "choice_zh_to_en"
  });
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({
    question_type: "choice_zh_to_en",
    choice_policy: "strict_tiered_v1"
  });
});

const partialChoicePreview = {
  ...preview,
  eligible_count: 1,
  choice: {
    total_count: 2,
    unavailable_count: 1,
    unavailable_truncated: false,
    unavailable_items: [
      {
        unit_key: "custom-item",
        source_wordlist_id: "list",
        entry_id: null,
        item_id: "custom-item",
        spelling: "myword",
        definition: "自定义释义",
        reason: "custom_source_unsupported"
      }
    ]
  }
};
it("requires explicit confirmation of the unavailable scope before creating a strict choice task", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await choose();
  mocks.preview.mockResolvedValue(partialChoicePreview);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
  );
  await screen.findByText("可练习 1 项内容");
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "单选范围确认" }
  });
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  expect(screen.getByRole("button", { name: "创建任务" })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("任务名称").closest("form")!);
  expect(mocks.create).not.toHaveBeenCalled();
  await screen.findByText("请先核对暂不可用内容，并确认仅使用可用内容创建。");
  fireEvent.click(
    screen.getByRole("checkbox", { name: /仅使用这 1 项可出单选的内容/ })
  );
  fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({
    choice_policy: "strict_tiered_v1",
    accept_partial_choice: true,
    preview_fingerprint: "fingerprint"
  });
});
it("invalidates scope confirmation when the server preview changes", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await choose();
  mocks.preview.mockResolvedValue(partialChoicePreview);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
  );
  const checkbox = await screen.findByRole("checkbox", {
    name: /仅使用这 1 项可出单选的内容/
  });
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  mocks.preview.mockResolvedValue({
    ...partialChoicePreview,
    preview_fingerprint: "new-scope"
  });
  fireEvent.change(screen.getByLabelText("每日题量"), {
    target: { value: "11" }
  });
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ daily_question_count: 11 }),
      expect.anything()
    )
  );
  await waitFor(() =>
    expect(
      screen.getByRole("checkbox", { name: /仅使用这 1 项可出单选的内容/ })
    ).not.toBeChecked()
  );
});
it("requires strict choice support even when an older server advertises mixed choice tasks", async () => {
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"]
  });
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await screen.findByText("当前单选题功能尚未就绪，可先创建拼写任务。");
  expect(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  ).toBeDisabled();
});

it("an old server disables choice without adding a new field to spelling requests", async () => {
  const { HttpError } = await import("@tsz/api-client");
  mocks.capabilities.mockRejectedValue(new HttpError(404, "not found"));
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await screen.findByText("当前单选题功能尚未就绪，可先创建拼写任务。");
  expect(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  ).toBeDisabled();
  await choose();
  expect(mocks.preview.mock.calls.at(-1)![0]).not.toHaveProperty(
    "question_type"
  );
});

it("a choice preview without approved questions explains the exclusion and cannot create", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await choose();
  mocks.preview.mockResolvedValue({
    ...preview,
    eligible_count: 0,
    can_create: false,
    reasons: ["所选词表暂无足够的无释义重叠选项，暂不可出单选题。"]
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "单选 看中文，选英文" })
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "拼写 看中文，写英文" })
  );
  await screen.findByText("所选词表暂无足够的无释义重叠选项，暂不可出单选题。");
  expect(screen.getByRole("button", { name: "创建任务" })).toBeDisabled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("opts into mastery only when supported and caps the initial queue at twenty", async () => {
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
    choice_policies: ["strict_tiered_v1", "mixed_tiered_v1"],
    practice_features: ["mixed_types_v1", "resume_wordlist_v1"],
    practice_modes: ["mastery_v1"]
  });
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await screen.findByText("错题重练另计");
  const count = screen.getByLabelText("每日题量");
  fireEvent.change(count, { target: { value: "21" } });
  expect(count).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(count, { target: { value: "20" } });
  expect(screen.getByRole("button", { name: "增加每日题量" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "减少每日题量" }));
  expect(count).toHaveValue(19);
  fireEvent.change(count, { target: { value: "1" } });
  expect(screen.getByRole("button", { name: "减少每日题量" })).toBeDisabled();
  fireEvent.change(count, { target: { value: "20" } });
  await choose();
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        practice_mode: "mastery_v1",
        daily_question_count: 20
      }),
      expect.anything()
    )
  );
});

it("localized suggested names stay within 50 code points and become a stable draft", async () => {
  mocks.myDetail.mockResolvedValue({
    ...wordlist,
    state: "draft",
    name: "🙂".repeat(48)
  });
  const tree = (locale: "en-GB" | "zh-Hant") => (
    <InterfaceI18nProvider locale={locale}>
      <LearningPlanCreator
        userId={mocks.user.id}
        wordlistId="list"
        owned
        directPractice
      />
    </InterfaceI18nProvider>
  );
  const view = renderWithProviders(tree("en-GB"));
  await screen.findByText("Available for practice: 35");
  const reads = mocks.preview.mock.calls.length;
  view.rerender(tree("zh-Hant"));
  expect(mocks.preview).toHaveBeenCalledTimes(reads);
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "開始練習" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  const draft = mocks.create.mock.calls[0]![0].name;
  expect([...draft]).toHaveLength(50);
  expect(draft).toBe("🙂".repeat(41) + " practice");
});
