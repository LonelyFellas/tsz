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
import { profile, target, question, candidate } from "./test-fixtures";
import { HttpError } from "@tsz/api-client";
import { GenerationTools } from "./GenerationTools";
import { BatchPanel } from "./BatchPanel";
import { QuestionBank } from "./QuestionBank";
import { useState } from "react";
const mocks = vi.hoisted(() => ({
  question: vi.fn(),
  candidates: vi.fn(),
  searchCandidates: vi.fn(),
  workbench: vi.fn(),
  inspect: vi.fn(),
  edit: vi.fn(),
  review: vi.fn(),
  generate: vi.fn(),
  generation: vi.fn(),
  generations: vi.fn(),
  questions: vi.fn(),
  cancel: vi.fn(),
  batchPreview: vi.fn(),
  createBatch: vi.fn(),
  batches: vi.fn(),
  batch: vi.fn(),
  batchItems: vi.fn(),
  cancelBatch: vi.fn()
}));
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
function providers(route: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const [client] = useState(
      () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
    );
    return (
      <QueryClientProvider client={client}>
        <ConfigProvider>
          <App>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </App>
        </ConfigProvider>
      </QueryClientProvider>
    );
  };
}
const wrapper = providers("/question-bank?entry_id=apple");
const mainWrapper = providers("/question-bank");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.question.mockResolvedValue(question);
  mocks.candidates.mockResolvedValue({
    contract_version: 1,
    items: [target]
  });
  mocks.searchCandidates.mockResolvedValue({
    items: [target],
    pagination: { page: 1, page_size: 20, total: 81, total_pages: 5 }
  });
  mocks.questions.mockResolvedValue({ items: [], pagination: { total: 0 } });
  mocks.inspect.mockResolvedValue({
    question,
    target_current: true,
    sources: question.content.options.map((o) => ({
      option_id: o.option_id,
      current: true
    }))
  });
  mocks.workbench.mockResolvedValue({
    items: [],
    counts: { draft: 0, approved: 0, rejected: 0, disabled: 0 },
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
  });
  mocks.generations.mockResolvedValue({ items: [], pagination: { total: 0 } });
});
it("generation timeout preserves the chosen source and retries the same idempotent request", async () => {
  mocks.generate.mockRejectedValue(new Error("网络中断"));
  render(
    <GenerationTools
      profile={profile}
      active
      initialTab="generate"
      showQuestion={vi.fn()}
    />,
    { wrapper }
  );
  const row = await screen.findByRole("row", { name: /apple.*apple 的释义/ });
  const radio = within(row).getByRole("radio");
  const generate = screen.getByRole("button", { name: "生成四选一草稿" });
  fireEvent.click(radio);
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);
  fireEvent.click(await screen.findByRole("button", { name: "确认生成" }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  await screen.findByText("网络中断");
  const retry = await screen.findByRole("button", { name: "重试原生成请求" });
  const first = mocks.generate.mock.calls[0]![0];
  expect(first.target).toMatchObject({
    candidate_ref: "apple",
    source: target.source
  });
  expect(radio).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
  expect(mocks.generate.mock.calls[1]![0]).toEqual(first);
}, 10_000);

it("candidate pagination reaches beyond the first eighty and resets selection", async () => {
  render(
    <GenerationTools
      profile={profile}
      active
      initialTab="generate"
      showQuestion={vi.fn()}
    />,
    { wrapper }
  );
  await screen.findByText("apple 的释义");
  fireEvent.click(await screen.findByTitle("5"));
  await waitFor(() =>
    expect(mocks.searchCandidates).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 5, page_size: 20 }),
      expect.anything()
    )
  );
});

it("batch previews show actual missing counts; uncertain creation retries the same intent and opens persistent results", async () => {
  const selection = { question_levels: ["B1"], answer_profiles: ["BrE"] };
  const preview = {
    selection,
    coverage: [
      {
        question_level: "B1",
        answer_profile: "BrE",
        eligible: 93,
        covered: 10,
        generating: 2,
        missing: 81
      }
    ],
    missing: 81,
    preview_token: "preview-1"
  };
  const batch = {
    id: "batch-1",
    created_by: "author",
    preview,
    state: "running",
    total: 81,
    queued: 79,
    running: 1,
    succeeded: 1,
    failed: 0,
    insufficient_candidates: 0,
    cancelled: 0,
    created_at: "2026-10-28T00:00:00Z"
  };
  mocks.batches.mockResolvedValue({ items: [batch], pagination: { total: 1 } });
  mocks.batchPreview.mockResolvedValue(preview);
  mocks.createBatch
    .mockRejectedValueOnce(new HttpError(503, "暂时不可用"))
    .mockResolvedValue(batch);
  mocks.batch.mockResolvedValue(batch);
  mocks.batchItems.mockResolvedValue({
    items: [
      {
        id: "g1",
        target,
        question_level: "B1",
        answer_profile: "BrE",
        state: "succeeded",
        question_id: "q1",
        error_code: null,
        reasons: []
      }
    ],
    pagination: { total: 1 }
  });
  const showQuestion = vi.fn();
  render(<BatchPanel profile={profile} showQuestion={showQuestion} active />, {
    wrapper
  });
  expect(screen.getByRole("button", { name: "开始补齐缺题" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "预览全库缺题" }));
  await screen.findByText("本次实际需生成 81 道待审核草稿。");
  fireEvent.click(await screen.findByRole("button", { name: "开始补齐缺题" }));
  fireEvent.click(await screen.findByRole("button", { name: "开始批量命题" }));
  await screen.findByText("暂时不可用");
  expect(screen.getByLabelText("批量学习等级")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原批次请求" }));
  await screen.findByText("批次 batch-1 · 进行中");
  expect(mocks.createBatch.mock.calls[0]![0]).toEqual(
    mocks.createBatch.mock.calls[1]![0]
  );
  expect(mocks.createBatch.mock.calls[0]![0]).toMatchObject({
    selection,
    preview_token: "preview-1"
  });
  fireEvent.click(await screen.findByRole("button", { name: "预览审核" }));
  expect(showQuestion).toHaveBeenCalledWith("q1");
  mocks.cancelBatch.mockResolvedValue({ ...batch, state: "cancelled" });
  fireEvent.click(screen.getByRole("button", { name: "取消批次" }));
  const confirmations = await screen.findAllByRole("button", {
    name: "取消批次"
  });
  fireEvent.click(confirmations[confirmations.length - 1]!);
  await waitFor(() =>
    expect(mocks.cancelBatch).toHaveBeenCalledExactlyOnceWith("batch-1")
  );
}, 10_000);

it("switching workbench tabs preserves an uncertain batch request and its idempotency key", async () => {
  mocks.batches.mockResolvedValue({ items: [], pagination: { total: 0 } });
  mocks.batchPreview.mockResolvedValue({
    selection: { question_levels: ["B1"], answer_profiles: ["BrE"] },
    coverage: [],
    missing: 1,
    preview_token: "batch-preview"
  });
  mocks.createBatch.mockRejectedValue(new HttpError(503, "请求结果未知"));
  render(
    <GenerationTools
      profile={profile}
      active
      initialTab="generate"
      showQuestion={vi.fn()}
    />,
    { wrapper }
  );
  fireEvent.click(screen.getByRole("tab", { name: "全库批量命题" }));
  fireEvent.click(screen.getByRole("button", { name: "预览全库缺题" }));
  await screen.findByText("本次实际需生成 1 道待审核草稿。");
  fireEvent.click(screen.getByRole("button", { name: "开始补齐缺题" }));
  fireEvent.click(await screen.findByRole("button", { name: "开始批量命题" }));
  await screen.findByText("请求结果未知");
  const original = mocks.createBatch.mock.calls[0]![0];
  fireEvent.click(screen.getByRole("tab", { name: "单词义命题" }));
  expect(
    screen.queryByRole("button", { name: "重试原批次请求" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "全库批量命题" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "重试原批次请求" })
  );
  await waitFor(() => expect(mocks.createBatch).toHaveBeenCalledTimes(2));
  expect(mocks.createBatch.mock.calls[1]![0]).toEqual(original);
}, 10_000);

it.each(["all", "succeeded"])(
  "fetches final batch results when detail completes before the %s task list",
  async (filter) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const batch = {
      id: "batch-race",
      created_by: "author",
      state: "running",
      total: 1,
      queued: 0,
      running: 1,
      succeeded: 0,
      failed: 0,
      insufficient_candidates: 0,
      cancelled: 0,
      preview: {
        selection: { question_levels: ["B1"], answer_profiles: ["BrE"] }
      },
      created_at: "2026-10-28T00:00:00Z"
    };
    const task = {
      id: "g-race",
      target,
      question_level: "B1",
      answer_profile: "BrE",
      state: "running",
      question_id: null,
      error_code: null,
      reasons: []
    };
    let completed = false;
    mocks.batches.mockResolvedValue({
      items: [batch],
      pagination: { total: 1 }
    });
    const finished = { ...batch, state: "completed", running: 0, succeeded: 1 };
    // 定时轮询也应读取完成态，不能在慢机器上用旧 mock 覆盖完成通知。
    mocks.batch.mockImplementation(() =>
      Promise.resolve(completed ? finished : batch)
    );
    mocks.batchItems.mockImplementation((_id, query) =>
      Promise.resolve({
        items: completed
          ? [{ ...task, state: "succeeded", question_id: "q-final" }]
          : query.state === "succeeded"
            ? []
            : [task],
        pagination: { total: completed || query.state !== "succeeded" ? 1 : 0 }
      })
    );
    const showQuestion = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ConfigProvider>
          <App>
            <MemoryRouter
              initialEntries={["/question-bank?batch_id=batch-race"]}
            >
              <BatchPanel
                profile={profile}
                showQuestion={showQuestion}
                active
              />
            </MemoryRouter>
          </App>
        </ConfigProvider>
      </QueryClientProvider>
    );
    await screen.findByText("批次 batch-race · 进行中");
    if (filter === "succeeded") {
      fireEvent.mouseDown(screen.getByLabelText("批次任务状态"));
      fireEvent.click(await screen.findByText("已生成草稿", {}));
    }
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(
      screen.queryByRole("button", { name: "预览审核" })
    ).not.toBeInTheDocument();
    completed = true;
    await act(async () =>
      client.setQueryData(
        ["question-bank", profile.id, "batches", "detail", "batch-race"],
        finished
      )
    );
    // 覆盖率插桩下等待 Query 通知与 AntD 表格完成异步渲染。
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "预览审核" },
        { timeout: 5_000 }
      )
    );
    expect(showQuestion).toHaveBeenCalledWith("q-final");
    client.clear();
  },
  10_000
);

it("生成记录读取失败后仍可刷新恢复", async () => {
  mocks.generations.mockRejectedValueOnce(new Error("记录读取失败"));
  render(
    <GenerationTools
      profile={profile}
      active
      initialTab="generations"
      showQuestion={vi.fn()}
    />,
    { wrapper }
  );
  await screen.findByText("记录读取失败");
  fireEvent.click(screen.getByRole("button", { name: /刷\s*新/ }));
  await waitFor(() => expect(mocks.generations).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByText("记录读取失败")).not.toBeInTheDocument()
  );
});

it("命题词义读取失败后仍可切回整个词库", async () => {
  mocks.searchCandidates.mockRejectedValueOnce(new Error("词义读取失败"));
  render(
    <GenerationTools
      profile={profile}
      active
      initialTab="generate"
      showQuestion={vi.fn()}
    />,
    { wrapper }
  );
  await screen.findByText("词义读取失败");
  fireEvent.click(screen.getByRole("button", { name: "查看整个词库" }));
  await screen.findByRole("row", { name: /apple.*apple 的释义/ });
  expect(screen.queryByText("当前词条的已发布词义")).not.toBeInTheDocument();
  expect(mocks.searchCandidates).toHaveBeenCalledTimes(2);
});

function workbenchItem(q = question) {
  return {
    id: q.id,
    revision: q.revision,
    state: q.state,
    created_by: q.created_by,
    spelling: q.content.target.spelling,
    definition: q.content.target.definition,
    part_of_speech: q.content.target.part_of_speech,
    prompt: q.content.prompt,
    question_level: q.content.question_level,
    answer_profile: q.content.answer_profile,
    options: q.content.options.map((o) => ({
      option_id: o.option_id,
      spelling: o.candidate.spelling
    })),
    correct_option_id: q.content.correct_option_id,
    source_current: true,
    has_concerns: false,
    updated_at: q.updated_at
  };
}
it("workbench search and pagination send complete filters to the backend", async () => {
  mocks.workbench.mockResolvedValue({
    items: [workbenchItem()],
    counts: { draft: 81, approved: 0, rejected: 0, disabled: 0 },
    pagination: { page: 1, page_size: 20, total: 81, total_pages: 5 }
  });
  const rendered = render(<QuestionBank />, { wrapper: mainWrapper });
  const ui = within(rendered.container);
  await ui.findByRole("button", { name: "apple" });
  const search = ui.getByRole("searchbox", { name: "搜索单词或题干" });
  fireEvent.change(search, { target: { value: "苹果" } });
  fireEvent.keyDown(search, { key: "Enter", code: "Enter", keyCode: 13 });
  await waitFor(() =>
    expect(mocks.workbench).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "苹果", page: 1 }),
      expect.anything()
    )
  );
  fireEvent.click(await ui.findByTitle("5"));
  await waitFor(() =>
    expect(mocks.workbench).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "苹果", page: 5 }),
      expect.anything()
    )
  );
});
it("a fixed review queue advances without offset skips and returns to the retained list", async () => {
  const second = {
    ...question,
    id: "second",
    content: {
      ...question.content,
      target: candidate("pear"),
      prompt: "梨",
      correct_option_id: "C"
    }
  };
  mocks.inspect.mockImplementation(async (id: string) => {
    const q = id === "second" ? second : question;
    return {
      question: q,
      target_current: true,
      sources: q.content.options.map((o) => ({
        option_id: o.option_id,
        current: true
      }))
    };
  });
  mocks.workbench.mockResolvedValue({
    items: [workbenchItem(), workbenchItem(second)],
    counts: { draft: 2, approved: 0, rejected: 0, disabled: 0 },
    pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 }
  });
  const rendered = render(<QuestionBank />, { wrapper: mainWrapper });
  const ui = within(rendered.container);
  fireEvent.click(await ui.findByRole("button", { name: "审核本页 2 道" }));
  await ui.findByRole("heading", { name: "苹果" });
  mocks.review.mockResolvedValueOnce({
    ...question,
    state: "approved",
    revision: 4
  });
  fireEvent.click(ui.getByRole("button", { name: "通过并下一题" }));
  expect(await ui.findByRole("heading", { name: "梨" })).toBeVisible();
  expect(ui.getByText("本次 2 道 · 已处理 1 道")).toBeVisible();
  fireEvent.click(ui.getByRole("button", { name: "返回题库" }));
  await ui.findByRole("button", { name: "apple" });
  expect(mocks.workbench).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1, page_size: 20 }),
    expect.anything()
  );
}, 10_000);
it("closing the generation drawer retains an uncertain single request", async () => {
  mocks.generate.mockRejectedValue(new Error("生成结果未确认"));
  const rendered = render(<QuestionBank />, { wrapper: mainWrapper });
  const ui = within(rendered.container);
  fireEvent.click(ui.getByRole("button", { name: "生成题目" }));
  const drawer = within(
    (await screen.findByText("命题与生成任务")).closest<HTMLElement>(
      "[role=dialog]"
    )!
  );
  const row = await drawer.findByRole("row", { name: /apple.*apple 的释义/ });
  fireEvent.click(within(row).getByRole("radio"));
  fireEvent.click(drawer.getByRole("button", { name: "生成四选一草稿" }));
  // The confirmation is mounted in a separate modal portal.
  fireEvent.click(await screen.findByRole("button", { name: "确认生成" }));
  await drawer.findByText("生成结果未确认");
  const original = mocks.generate.mock.calls[0]![0];
  expect(drawer.getByText("命题与生成任务")).toBeVisible();
  fireEvent.click(drawer.getByRole("button", { name: "Close" }));
  fireEvent.click(ui.getByRole("button", { name: "生成题目" }));
  fireEvent.click(
    await drawer.findByRole("button", { name: "重试原生成请求" })
  );
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
  expect(mocks.generate.mock.calls[1]![0]).toEqual(original);
}, 10_000);

it("reopening a listed question rechecks publication sources instead of trusting an earlier inspection", async () => {
  mocks.workbench.mockResolvedValue({
    items: [workbenchItem()],
    counts: { draft: 1, approved: 0, rejected: 0, disabled: 0 },
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
  const rendered = render(<QuestionBank />, { wrapper: mainWrapper });
  const ui = within(rendered.container);
  fireEvent.click(await ui.findByRole("button", { name: "apple" }));
  expect(await ui.findByRole("button", { name: "通过并下一题" })).toBeEnabled();
  fireEvent.click(ui.getByRole("button", { name: "返回题库" }));
  mocks.inspect.mockResolvedValue({
    question,
    target_current: true,
    sources: question.content.options.map((o, i) => ({
      option_id: o.option_id,
      current: i !== 1
    }))
  });
  fireEvent.click(await ui.findByRole("button", { name: "apple" }));
  await ui.findByText("部分选项的发布来源已变化");
  expect(ui.getByRole("button", { name: "通过并下一题" })).toBeDisabled();
  expect(mocks.inspect).toHaveBeenCalledTimes(2);
}, 10_000);
