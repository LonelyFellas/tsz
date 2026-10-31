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
  list: vi.fn(),
  get: vi.fn(),
  myDetail: vi.fn(),
  push: vi.fn(),
  user: { id: "learner", roles: ["student"] }
}));
vi.mock("@/lib/request", () => ({
  api: {
    learning: { capabilities: mocks.capabilities },
    learningPlans: { preview: mocks.preview, create: mocks.create },
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
  mocks.user = { id: "learner", roles: ["student"] };
  mocks.get.mockResolvedValue(wordlist);
  mocks.myDetail.mockResolvedValue({ ...wordlist, state: "draft" });
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"]
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mocks.preview.mockResolvedValue(preview);
  mocks.create.mockResolvedValue({ task: { id: "created" } });
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
  await screen.findByText("35 个平台词条 · 35 道可出题内容");
}
it.each([false, true])(
  "preselects the current wordlist with owned=%s and creates without opening the picker",
  async (owned) => {
    renderWithProviders(
      <LearningTaskCreator wordlistId="list" owned={owned} />
    );
    await screen.findByText("35 个平台词条 · 35 道可出题内容");
    expect(owned ? mocks.myDetail : mocks.get).toHaveBeenCalledWith("list", {
      signal: expect.any(AbortSignal)
    });
    expect(owned ? mocks.get : mocks.myDetail).not.toHaveBeenCalled();
    expect(screen.getByLabelText("任务名称")).toHaveValue("原词表练习");
    expect(
      screen.getByRole("button", { name: "选择词表（1/5）" })
    ).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ wordlist_ids: ["list"] }),
      { signal: expect.any(AbortSignal) }
    );
    fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      wordlist_ids: ["list"],
      name: "原词表练习"
    });
  }
);
it("does not restore a preselected source after the learner removes it", async () => {
  renderWithProviders(<LearningTaskCreator wordlistId="list" owned />);
  await screen.findByText("35 个平台词条 · 35 道可出题内容");
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "我的计划" }
  });
  fireEvent.click(screen.getByRole("button", { name: "移除 原词表" }));
  expect(
    screen.getByRole("button", { name: "选择词表（0/5）" })
  ).toBeInTheDocument();
  expect(screen.getByLabelText("任务名称")).toHaveValue("我的计划");
  expect(screen.getByRole("button", { name: "完成创建" })).toBeDisabled();
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
  await screen.findByText("35 个平台词条 · 35 道可出题内容");
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "用户已编辑的任务名" }
  });
  fireEvent.change(screen.getByLabelText("每日题量"), {
    target: { value: "15" }
  });
  fireEvent.click(
    screen.getByRole("radio", { name: "单选题 · 看中文，选英文" })
  );
  fireEvent.click(screen.getByLabelText(/设置日期计划/));
  fireEvent.change(screen.getByLabelText("开始学习日"), {
    target: { value: "2026-11-01" }
  });
  fireEvent.change(screen.getByLabelText("结束学习日"), {
    target: { value: "2026-11-10" }
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成创建" })).toBeEnabled()
  );
  mocks.myDetail.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await client.refetchQueries({ queryKey: ["learning-plan-source"] });
  });
  await screen.findByRole("alert");
  expect(screen.getByLabelText("任务名称")).toHaveValue("用户已编辑的任务名");
  expect(screen.getByLabelText("每日题量")).toHaveValue(15);
  expect(
    screen.getByRole("radio", { name: "单选题 · 看中文，选英文" })
  ).toBeChecked();
  expect(screen.getByLabelText("开始学习日")).toHaveValue("2026-11-01");
  expect(screen.getByLabelText("结束学习日")).toHaveValue("2026-11-10");
  expect(
    screen.getByRole("button", { name: "选择词表（1/5）" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "完成创建" })).toBeDisabled();
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
  expect(screen.getByRole("button", { name: "完成创建" })).toBeDisabled();
  await act(async () =>
    finish({ ...wordlist, name: "刷新后的词表名", state: "draft" })
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成创建" })).toBeEnabled()
  );
  expect(screen.getByLabelText("任务名称")).toHaveValue("用户已编辑的任务名");
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
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
  await screen.findByText("35 个平台词条 · 35 道可出题内容");
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
  await screen.findByText("35 个平台词条 · 35 道可出题内容");
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
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
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
  await screen.findByText("35 个平台词条 · 35 道可出题内容");
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
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
  await screen.findByText("35 个平台词条 · 35 道可出题内容");
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
  await waitFor(() => expect(name).toHaveFocus());
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
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/student/tasks/created")
  );
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({ name: "每日拼写" });
});
it("date feedback shares the schedule predicate and clears after a submitted range is corrected", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "每日拼写" }
  });
  await choose();
  fireEvent.click(screen.getByLabelText(/设置日期计划/));
  const start = screen.getByLabelText("开始学习日");
  const end = screen.getByLabelText("结束学习日");
  const message = "请填写完整日期，结束日期不得早于开始日期。";
  for (const input of [start, end]) {
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(expect.stringContaining(message));
  }
  fireEvent.change(start, { target: { value: "2026-10-20" } });
  fireEvent.change(end, { target: { value: "2026-10-19" } });
  fireEvent.submit(start.closest("form")!);
  await waitFor(() => expect(start).toHaveFocus());
  fireEvent.change(end, { target: { value: "2026-10-20" } });
  expect(start).toHaveAttribute("aria-invalid", "false");
  expect(end).toHaveAttribute("aria-invalid", "false");
  expect(start).not.toHaveAttribute("aria-describedby");
  expect(end).toHaveAccessibleDescription(
    "含首尾两天；以北京时间 04:00 划分学习日。"
  );
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成创建" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({
    daily_question_count: 10,
    schedule: { start_date: "2026-10-20", end_date: "2026-10-20" }
  });
});
it.each(["disable schedule", "switch to longterm"])(
  "%s removes hidden submitted errors without blocking creation",
  async (action) => {
    renderWithProviders(<LearningPlanCreator userId="learner" />);
    const name = screen.getByLabelText("任务名称");
    fireEvent.change(name, { target: { value: "每日拼写" } });
    await choose();
    fireEvent.click(screen.getByLabelText(/设置日期计划/));
    if (action === "switch to longterm") {
      fireEvent.change(screen.getByLabelText("每日题量"), {
        target: { value: "201" }
      });
    }
    fireEvent.submit(name.closest("form")!);
    expect(screen.getByLabelText("开始学习日")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    if (action === "disable schedule") {
      fireEvent.click(screen.getByLabelText(/设置日期计划/));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "长期任务" }));
    }
    expect(screen.queryByLabelText("开始学习日")).not.toBeInTheDocument();
    expect(
      screen.queryByText("请填写完整日期，结束日期不得早于开始日期。")
    ).not.toBeInTheDocument();
    expect(
      name.closest("form")!.querySelector('[aria-invalid="true"]')
    ).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "完成创建" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      task_type: action === "disable schedule" ? "daily" : "longterm",
      daily_question_count: action === "disable schedule" ? 10 : null,
      schedule: null
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
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
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
  fireEvent.click(screen.getByLabelText(/设置日期计划/));
  fireEvent.change(screen.getByLabelText("开始学习日"), {
    target: { value: "2026-10-20" }
  });
  fireEvent.change(screen.getByLabelText("结束学习日"), {
    target: { value: "2026-11-20" }
  });
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
  await screen.findByText("35 个平台词条 · 22 道可出题内容");
  finish(preview);
  await waitFor(() =>
    expect(
      screen.queryByText("35 个平台词条 · 35 道可出题内容")
    ).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
  await screen.findByText("请输入 1–50 字的任务名称。");
  await waitFor(() => expect(screen.getByLabelText("任务名称")).toHaveFocus());
  expect(mocks.create).not.toHaveBeenCalled();
});

it("choice creation previews the selected type and preserves it through the create request", async () => {
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  const choice = await screen.findByRole("radio", {
    name: "单选题 · 看中文，选英文"
  });
  await waitFor(() => expect(choice).toBeEnabled());
  fireEvent.click(choice);
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "中文单选" }
  });
  await choose();
  expect(mocks.preview.mock.calls.at(-1)![0]).toMatchObject({
    question_type: "choice_zh_to_en"
  });
  fireEvent.click(screen.getByRole("button", { name: "完成创建" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0]![0]).toMatchObject({
    question_type: "choice_zh_to_en"
  });
});

it("an old server disables choice without adding a new field to spelling requests", async () => {
  const { HttpError } = await import("@tsz/api-client");
  mocks.capabilities.mockRejectedValue(new HttpError(404, "not found"));
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await screen.findByText("当前单选题功能尚未就绪，可先创建拼写任务。");
  expect(
    screen.getByRole("radio", { name: "单选题 · 看中文，选英文" })
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
    screen.getByRole("radio", { name: "单选题 · 看中文，选英文" })
  );
  await screen.findByText("所选词表暂无足够的无释义重叠选项，暂不可出单选题。");
  expect(screen.getByRole("button", { name: "完成创建" })).toBeDisabled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("opts into mastery only when supported and caps the initial queue at twenty", async () => {
  mocks.capabilities.mockResolvedValue({
    question_types: ["spelling_zh_to_en", "choice_zh_to_en"],
    practice_modes: ["mastery_v1"]
  });
  renderWithProviders(<LearningPlanCreator userId="learner" />);
  await screen.findByText("按单词掌握情况安排新学、错题重练和到期复习。");
  const count = screen.getByLabelText("每日题量");
  fireEvent.change(count, { target: { value: "21" } });
  expect(count).toHaveAttribute("aria-invalid", "true");
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
