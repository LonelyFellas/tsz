import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  capabilities: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  push: vi.fn(),
  user: { id: "learner", roles: ["student"] }
}));
vi.mock("@/lib/request", () => ({
  api: {
    learning: { capabilities: mocks.capabilities },
    learningPlans: { preview: mocks.preview, create: mocks.create },
    wordList: { library: { list: mocks.list } }
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
    reasons: ["所选词表暂无匹配等级和档位的已审核单选题。"]
  });
  fireEvent.click(
    screen.getByRole("radio", { name: "单选题 · 看中文，选英文" })
  );
  await screen.findByText("所选词表暂无匹配等级和档位的已审核单选题。");
  expect(screen.getByRole("button", { name: "完成创建" })).toBeDisabled();
  expect(mocks.create).not.toHaveBeenCalled();
});
