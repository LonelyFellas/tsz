import {
  fireEvent,
  act,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { AdminProfile, BankQuestion, QuestionCandidate } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionBank } from "./QuestionBank";
const mocks = vi.hoisted(() => ({
  question: vi.fn(),
  candidates: vi.fn(),
  edit: vi.fn(),
  review: vi.fn(),
  generate: vi.fn(),
  generation: vi.fn(),
  generations: vi.fn(),
  questions: vi.fn(),
  cancel: vi.fn()
}));
const profile = {
  id: "author",
  role: "admin",
  permissions: ["words.access", "words.edit", "words.publish"]
} as AdminProfile;
vi.mock("@/lib/auth", () => ({
  api: { questionBank: mocks },
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({
      profile: {
        id: "author",
        role: "admin",
        permissions: ["words.access", "words.edit", "words.publish"]
      }
    })
}));
function candidate(spelling: string): QuestionCandidate {
  return {
    candidate_ref: spelling,
    source: {
      entry_id: spelling,
      publication_id: `${spelling}-published`,
      sense_id: `${spelling}-sense`,
      definition_id: `${spelling}-definition`,
      pos_id: "noun",
      form_id: `${spelling}-form`
    },
    content_fingerprint: spelling,
    spelling,
    part_of_speech: "n.",
    level: "A1",
    definition: `${spelling} 的释义`,
    other_definitions: [],
    accepted_spellings: [spelling],
    answer_profile: "BrE",
    form_type: "base",
    teaching_eligible: true
  };
}
const target = candidate("apple");
const content = {
  target,
  prompt: "苹果",
  question_level: "B1",
  answer_profile: "BrE",
  options: ["apple", "banana", "pear", "orange"].map((word, index) => ({
    option_id: String.fromCharCode(65 + index),
    candidate: candidate(word),
    explanation: `${word} 理由`
  })),
  correct_option_id: "A",
  explanation: "苹果对应 apple。",
  concerns: ["请核查干扰项语义。"]
};
const question: BankQuestion = {
  id: "question",
  generation_id: "generation",
  revision: 3,
  state: "draft",
  content,
  original_content: content,
  created_by: "author",
  reviewed_by: null,
  review_comment: "",
  created_at: "2026-10-28T00:00:00Z",
  updated_at: "2026-10-28T00:00:00Z"
};
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return (
    <QueryClientProvider client={client}>
      <ConfigProvider>
        <App>
          <MemoryRouter initialEntries={["/question-bank?entry_id=apple"]}>
            {children}
          </MemoryRouter>
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.question.mockResolvedValue(question);
  mocks.candidates.mockResolvedValue({
    contract_version: 1,
    items: [target, candidate("lemon")]
  });
  mocks.questions.mockResolvedValue({ items: [], pagination: { total: 0 } });
  mocks.generations.mockResolvedValue({ items: [], pagination: { total: 0 } });
});
it("failed edits survive closing and reopening; review uses the saved revision and never bypasses unsaved changes", async () => {
  mocks.edit.mockRejectedValueOnce(new HttpError(409, "题目已被修改"));
  const props = {
    id: "question",
    open: true,
    profile,
    onClose: vi.fn(),
    onDirtyChange: vi.fn()
  };
  const view = render(<QuestionEditor {...props} />, { wrapper });
  const prompt = await screen.findByLabelText("中文题干");
  fireEvent.change(prompt, { target: { value: "一种常见水果：苹果" } });
  expect(screen.getByRole("button", { name: "审核通过并启用" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  await screen.findByText("题目已被修改");
  expect(prompt).toHaveValue("一种常见水果：苹果");
  view.rerender(<QuestionEditor {...props} open={false} />);
  view.rerender(<QuestionEditor {...props} />);
  expect(screen.getByLabelText("中文题干")).toHaveValue("一种常见水果：苹果");
  mocks.edit.mockResolvedValue({
    ...question,
    revision: 4,
    content: { ...content, prompt: "一种常见水果：苹果" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "审核通过并启用" })).toBeEnabled()
  );
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
  fireEvent.click(screen.getByRole("button", { name: "审核通过并启用" }));
  await waitFor(() => expect(mocks.review).toHaveBeenCalledOnce());
  expect(mocks.review.mock.calls[0]![1]).toMatchObject({
    expected_revision: 4,
    decision: "approve"
  });
  await screen.findByRole("button", { name: "停用题目" });
  expect(screen.getByLabelText("中文题干")).toBeDisabled();
});
it("another owner's question is readable but cannot be edited or reviewed with own-only permissions", async () => {
  mocks.question.mockResolvedValue({ ...question, created_by: "other" });
  render(
    <QuestionEditor
      id="question"
      open
      profile={profile}
      onClose={vi.fn()}
      onDirtyChange={vi.fn()}
    />,
    { wrapper }
  );
  expect(await screen.findByLabelText("中文题干")).toBeDisabled();
  expect(screen.getByRole("button", { name: "审核通过并启用" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "保存修改" })
  ).not.toBeInTheDocument();
  expect(mocks.review).not.toHaveBeenCalled();
});

it("a late save from an unmounted question cannot clear another question's dirty state", async () => {
  let resolveEdit!: (value: BankQuestion) => void;
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
  mocks.question.mockImplementation(async (id: string) =>
    id === "second" ? second : question
  );
  const dirty = vi.fn();
  const props = {
    id: "question",
    open: true,
    profile,
    onClose: vi.fn(),
    onDirtyChange: dirty
  };
  const rendered = render(<QuestionEditor {...props} />, { wrapper });
  fireEvent.change(await screen.findByLabelText("中文题干"), {
    target: { value: "第一题修改" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
  await waitFor(() => expect(mocks.edit).toHaveBeenCalledOnce());
  rendered.rerender(<QuestionEditor {...props} id="second" />);
  const current = await screen.findByDisplayValue("第二题原稿");
  fireEvent.change(current, { target: { value: "第二题尚未保存的修改" } });
  dirty.mockClear();
  await act(async () =>
    resolveEdit({
      ...question,
      revision: 4,
      content: { ...content, prompt: "第一题修改" }
    })
  );
  expect(current).toHaveValue("第二题尚未保存的修改");
  expect(dirty).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "审核通过并启用" })).toBeDisabled();
  rendered.rerender(<QuestionEditor {...props} />);
  expect(await screen.findByDisplayValue("第一题修改")).toBeInTheDocument();
});
it("generation timeout preserves the chosen source and retries the same idempotent request", async () => {
  mocks.generate.mockRejectedValue(new Error("网络中断"));
  render(<QuestionBank />, { wrapper });
  const row = await screen.findByRole("row", { name: /apple.*apple 的释义/ });
  fireEvent.click(within(row).getByRole("radio"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "生成四选一草稿" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "生成四选一草稿" }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  await screen.findByText("网络中断");
  await screen.findByRole("button", { name: "重试原生成请求" });
  const first = mocks.generate.mock.calls[0]![0];
  expect(first.target).toMatchObject({
    candidate_ref: "apple",
    source: target.source
  });
  expect(within(row).getByRole("radio")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原生成请求" }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
  expect(mocks.generate.mock.calls[1]![0]).toEqual(first);
});

it("列表失败后仍可筛选、刷新题目与生成记录", async () => {
  mocks.questions.mockRejectedValueOnce(new Error("审核读取失败"));
  mocks.generations.mockRejectedValueOnce(new Error("记录读取失败"));
  render(<QuestionBank />, { wrapper });
  fireEvent.click(screen.getByRole("tab", { name: "题目审核" }));
  await screen.findByText("审核读取失败");
  expect(screen.getByRole("combobox", { name: "题目状态" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: /刷\s*新/ }));
  await waitFor(() => expect(mocks.questions).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByText("审核读取失败")).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("tab", { name: "生成记录" }));
  await screen.findByText("记录读取失败");
  fireEvent.click(screen.getByRole("button", { name: /刷\s*新/ }));
  await waitFor(() => expect(mocks.generations).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByText("记录读取失败")).not.toBeInTheDocument()
  );
});

it("命题词义读取失败后仍可切回整个词库", async () => {
  mocks.candidates.mockRejectedValueOnce(new Error("词义读取失败"));
  render(<QuestionBank />, { wrapper });
  await screen.findByText("词义读取失败");
  fireEvent.click(screen.getByRole("button", { name: "查看整个词库" }));
  await screen.findByRole("row", { name: /apple.*apple 的释义/ });
  expect(screen.queryByText("当前词条的已发布词义")).not.toBeInTheDocument();
  expect(mocks.candidates).toHaveBeenCalledTimes(2);
});
