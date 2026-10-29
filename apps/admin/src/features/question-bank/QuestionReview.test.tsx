import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { useState } from "react";
import { App, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { BankQuestion } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { QuestionReview } from "./QuestionReview";
import { candidate, content, profile, question } from "./test-fixtures";
const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  edit: vi.fn(),
  review: vi.fn(),
  searchCandidates: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ api: { questionBank: mocks } }));
const inspect = (q = question) => ({
  question: q,
  target_current: true,
  semantic_review: { verdict: "no_obvious_issue" as const, issues: [] },
  semantic_review_current: true,
  sources: q.content.options.map((o) => ({
    option_id: o.option_id,
    current: true
  }))
});
function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <ConfigProvider>
        <App>{children}</App>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
const callbacks = () => ({
  onDirtyChange: vi.fn(),
  onQuestionChange: vi.fn(),
  onDecision: vi.fn(),
  onRegenerate: vi.fn(),
  onSkip: vi.fn(),
  onTrialChange: vi.fn()
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.inspect.mockResolvedValue(inspect());
  mocks.searchCandidates.mockResolvedValue({
    items: [candidate("lemon")],
    pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 }
  });
});
it("failed edits retain fields, block approval, and approve only the saved revision", async () => {
  mocks.edit.mockRejectedValueOnce(new HttpError(409, "题目已被修改"));
  const props = { id: "question", profile, ...callbacks() };
  const view = render(<QuestionReview {...props} />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "修改" }));
  fireEvent.change(screen.getByLabelText("中文题干"), {
    target: { value: "一种常见水果：苹果" }
  });
  expect(
    screen.queryByRole("button", { name: "通过并下一题" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  await screen.findByText("题目已被修改");
  view.rerender(<QuestionReview {...props} />);
  expect(screen.getByLabelText("中文题干")).toHaveValue("一种常见水果：苹果");
  mocks.edit.mockResolvedValue({
    ...question,
    revision: 4,
    content: { ...content, prompt: "一种常见水果：苹果" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  const approve = await screen.findByRole("button", { name: "通过并下一题" });
  expect(approve).toBeEnabled();
  expect(mocks.edit.mock.calls[1]![1]).toMatchObject({
    expected_revision: 3,
    prompt: "一种常见水果：苹果",
    options: content.options.map((o) => ({
      candidate_ref: o.candidate.candidate_ref,
      source: o.candidate.source,
      answer_profile: "BrE"
    }))
  });
  mocks.review.mockResolvedValue({
    ...question,
    state: "approved",
    revision: 5
  });
  fireEvent.click(approve);
  await waitFor(() =>
    expect(mocks.review).toHaveBeenCalledWith(
      "question",
      expect.objectContaining({ expected_revision: 4, decision: "approve" })
    )
  );
  await screen.findByRole("button", { name: "停用题目" });
  expect(
    screen.queryByRole("button", { name: "修改" })
  ).not.toBeInTheDocument();
});
it("another owner's question remains readable but cannot be modified or reviewed", async () => {
  mocks.inspect.mockResolvedValue(
    inspect({ ...question, created_by: "other" })
  );
  render(<QuestionReview id="question" profile={profile} {...callbacks()} />, {
    wrapper: Wrapper
  });
  expect(await screen.findByRole("heading", { name: "苹果" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "修改" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "通过并下一题" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: /更换干扰项/ })
  ).not.toBeInTheDocument();
});
it("a late save from an unmounted question does not clear the next question's dirty input", async () => {
  let resolveEdit!: (q: BankQuestion) => void;
  mocks.edit.mockImplementation(
    () =>
      new Promise<BankQuestion>((resolve) => {
        resolveEdit = resolve;
      })
  );
  const second = {
    ...question,
    id: "second",
    content: { ...content, prompt: "第二题原稿" }
  };
  mocks.inspect.mockImplementation(async (id: string) =>
    inspect(id === "second" ? second : question)
  );
  const props = { id: "question", profile, ...callbacks() };
  const view = render(<QuestionReview {...props} />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "修改" }));
  fireEvent.change(screen.getByLabelText("中文题干"), {
    target: { value: "第一题修改" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  await waitFor(() => expect(mocks.edit).toHaveBeenCalledOnce());
  view.rerender(<QuestionReview {...props} id="second" />);
  await screen.findByRole("heading", { name: "第二题原稿" });
  fireEvent.click(screen.getByRole("button", { name: "修改" }));
  const input = screen.getByLabelText("中文题干");
  fireEvent.change(input, { target: { value: "第二题尚未保存的修改" } });
  props.onDirtyChange.mockClear();
  await act(async () =>
    resolveEdit({
      ...question,
      revision: 4,
      content: { ...content, prompt: "第一题修改" }
    })
  );
  expect(input).toHaveValue("第二题尚未保存的修改");
  expect(props.onDirtyChange).not.toHaveBeenCalled();
  view.rerender(<QuestionReview {...props} />);
  expect(
    await screen.findByRole("heading", { name: "第一题修改" })
  ).toBeVisible();
});
it("source changes block approval and trial; replacement excludes occupied words and requires a fresh rationale", async () => {
  mocks.inspect.mockResolvedValue({
    ...inspect(),
    sources: content.options.map((o, i) => ({
      option_id: o.option_id,
      current: i !== 1
    }))
  });
  render(<QuestionReview id="question" profile={profile} {...callbacks()} />, {
    wrapper: Wrapper
  });
  expect(
    await screen.findByRole("button", { name: "通过并下一题" })
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "学生试做" })).toBeDisabled();
  const sources = screen.getByRole("complementary", {
    name: "命题词义与选项来源"
  });
  fireEvent.click(within(sources).getAllByRole("button", { name: "更换" })[0]!);
  await screen.findByText("lemon 的释义");
  expect(mocks.searchCandidates).toHaveBeenCalledWith(
    expect.objectContaining({
      part_of_speech: "n.",
      question_level: "B1",
      answer_profile: "BrE",
      editable_only: false,
      exclude_entry_ids: ["apple", "pear", "orange"]
    }),
    expect.anything()
  );
  fireEvent.click(screen.getByRole("button", { name: "使用此词义" }));
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  await screen.findByText("请说明此选项的理由。");
  expect(mocks.edit).not.toHaveBeenCalled();
  const input = screen.getByRole("textbox", {
    name: "为什么容易混淆、为什么错误"
  });
  expect(input).toHaveFocus();
  fireEvent.change(input, {
    target: { value: "同属水果，但 lemon 是柠檬，不是苹果。" }
  });
  mocks.edit.mockResolvedValue({
    ...question,
    revision: 4,
    content: {
      ...content,
      options: content.options.map((o, i) =>
        i === 1
          ? {
              ...o,
              candidate: candidate("lemon"),
              explanation: "同属水果，但 lemon 是柠檬，不是苹果。"
            }
          : o
      )
    }
  });
  mocks.inspect.mockResolvedValue(
    inspect({
      ...question,
      revision: 4,
      content: {
        ...content,
        options: content.options.map((o, i) =>
          i === 1 ? { ...o, candidate: candidate("lemon") } : o
        )
      }
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  expect(
    await screen.findByRole("button", { name: "通过并下一题" })
  ).toBeEnabled();
});
it("trial hides the answer until submission and never calls a learning mutation", async () => {
  render(<QuestionReview id="question" profile={profile} {...callbacks()} />, {
    wrapper: Wrapper
  });
  fireEvent.click(await screen.findByRole("button", { name: "学生试做" }));
  expect(screen.queryByText("正确答案", {})).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "查看引用的发布词义" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "选项 B banana" }));
  fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await screen.findByText("回答错误，请查看解析");
  expect(screen.getByText("正确答案", {})).toBeVisible();
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(mocks.review).not.toHaveBeenCalled();
});

it("a transient inspection failure keeps local edits, but a revoked read permission hides the session", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  function Provider({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ConfigProvider>
          <App>{children}</App>
        </ConfigProvider>
      </QueryClientProvider>
    );
  }
  render(<QuestionReview id="question" profile={profile} {...callbacks()} />, {
    wrapper: Provider
  });
  fireEvent.click(await screen.findByRole("button", { name: "修改" }));
  fireEvent.change(screen.getByLabelText("中文题干"), {
    target: { value: "未保存但必须保留的修改" }
  });
  mocks.inspect.mockRejectedValueOnce(new HttpError(503, "核查暂时不可用"));
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["question-bank", profile.id, "inspection", "question"]
    });
  });
  await screen.findByText("暂未能重新核查发布来源");
  expect(screen.getByLabelText("中文题干")).toHaveValue(
    "未保存但必须保留的修改"
  );
  mocks.inspect.mockRejectedValueOnce(new HttpError(403, "读取权限已撤销"));
  fireEvent.click(screen.getByRole("button", { name: "重试核查" }));
  await screen.findByText("读取权限已撤销");
  expect(screen.queryByLabelText("中文题干")).not.toBeInTheDocument();
  client.clear();
});

it("an unavailable target remains read-only when the administrator cannot generate", async () => {
  mocks.inspect.mockResolvedValue({
    ...inspect(),
    target_current: false,
    sources: content.options.map((o) => ({
      option_id: o.option_id,
      current: false
    }))
  });
  const props = callbacks();
  render(
    <QuestionReview
      id="question"
      profile={{ ...profile, permissions: ["words.access"] }}
      {...props}
    />,
    { wrapper: Wrapper }
  );
  const regenerate = await screen.findByRole("button", {
    name: "重新选择命题词义"
  });
  expect(regenerate).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "修改" })
  ).not.toBeInTheDocument();
  expect(props.onRegenerate).not.toHaveBeenCalled();
});
it("unresolved semantic issues are separate from ordinary hints and block unchanged approval", async () => {
  mocks.inspect.mockResolvedValue({
    ...inspect(),
    semantic_review: {
      verdict: "needs_revision",
      issues: ["banana 也可能匹配当前题干"]
    }
  });
  render(<QuestionReview id="question" profile={profile} {...callbacks()} />, {
    wrapper: Wrapper
  });
  const title = await screen.findByText("存在尚未解决的歧义");
  const alert = title.closest('[role="alert"]')!;
  fireEvent.click(screen.getByText("查看 1 条具体问题"));
  expect(
    within(alert as HTMLElement).getByText("banana 也可能匹配当前题干")
  ).toBeVisible();
  expect(
    within(alert as HTMLElement).queryByText("请核查干扰项语义。")
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "通过并下一题" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "学生试做" }));
  expect(
    screen.queryByText("banana 也可能匹配当前题干")
  ).not.toBeInTheDocument();
});
it("saving a replacement retains the original ambiguity evidence without calling it a new review", async () => {
  const risk = { verdict: "needs_revision", issues: ["干扰项也有目标含义"] };
  mocks.inspect.mockResolvedValue({ ...inspect(), semantic_review: risk });
  render(<QuestionReview id="question" profile={profile} {...callbacks()} />, {
    wrapper: Wrapper
  });
  fireEvent.click(await screen.findByText("查看 1 条具体问题"));
  fireEvent.click(
    await screen.findByRole("button", { name: "更换选项 B banana" })
  );
  fireEvent.click(await screen.findByRole("button", { name: "使用此词义" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "为什么容易混淆、为什么错误" }),
    {
      target: { value: "柠檬与苹果均为水果，但柠檬不是苹果" }
    }
  );
  const changed = {
    ...question,
    revision: 4,
    content: {
      ...content,
      options: content.options.map((o, i) =>
        i === 1
          ? { ...o, candidate: candidate("lemon"), explanation: "柠檬不是苹果" }
          : o
      )
    }
  };
  mocks.edit.mockResolvedValue(changed);
  mocks.inspect.mockResolvedValue({
    ...inspect(changed),
    semantic_review: risk,
    semantic_review_current: false
  });
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  await screen.findByText("原稿存在歧义，当前修改尚未复审");
  expect(screen.getByText("干扰项也有目标含义")).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "通过并下一题" })).toBeEnabled()
  );
});
it("legacy questions without review evidence are explicitly unverified", async () => {
  mocks.inspect.mockResolvedValue({
    ...inspect(),
    semantic_review: null,
    semantic_review_current: false
  });
  render(<QuestionReview id="question" profile={profile} {...callbacks()} />, {
    wrapper: Wrapper
  });
  await screen.findByText("缺少语义复审记录");
  expect(screen.queryByText("存在尚未解决的歧义")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "通过并下一题" })).toBeEnabled();
});
