import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  push: vi.fn(),
  user: { id: "learner", roles: ["student"] }
}));
vi.mock("@/lib/request", () => ({
  api: {
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
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mocks.preview.mockResolvedValue(preview);
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
