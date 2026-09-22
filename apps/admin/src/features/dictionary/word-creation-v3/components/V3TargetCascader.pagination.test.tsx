import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client/http";
import type {
  PublishedSentenceTargetCandidateV3,
  SearchComponentTargetsV3Response
} from "@tsz/types";
import { V3TargetCascader } from "./V3TargetCascader";

const search = vi.fn();
vi.mock("../api", () => ({
  createV3WordRequests: () => ({ searchComponentTargets: search })
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "uk" })
}));
beforeEach(() => {
  search.mockReset();
});

function candidate(index: number): PublishedSentenceTargetCandidateV3 {
  return {
    entry_id: `entry-${index}`,
    publication_id: `pub-${index}`,
    headword: `give ${index}`,
    kind: "word",
    pos: "verb",
    pos_id: `pos-${index}`,
    base_form_id: `form-${index}`,
    matched_form_id: `form-${index}`,
    matched_variant_id: `variant-${index}`,
    matched_dialect: "common",
    matched_form_type: "base",
    matches: [],
    component_usages: [],
    forms: [
      {
        form_id: `form-${index}`,
        variant_id: `variant-${index}`,
        form_type: "base",
        dialect: "common",
        spelling: "give",
        base_form_ids: [`form-${index}`]
      }
    ],
    senses: [
      {
        sense_id: `sense-${index}`,
        publication_id: `pub-${index}`,
        pos_id: `pos-${index}`,
        base_form_id: `form-${index}`,
        level: "A1",
        gloss: `释义 ${index}`
      }
    ]
  };
}
function response(
  matches: PublishedSentenceTargetCandidateV3[],
  next_cursor?: string
): SearchComponentTargetsV3Response {
  return {
    schema_version: 3,
    matches,
    total: 51,
    truncated: Boolean(next_cursor),
    ...(next_cursor ? { next_cursor } : {})
  };
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("首批50条后加载第51条并选中完整目标，加载期间阻止重复请求", async () => {
  const next = pending<SearchComponentTargetsV3Response>();
  search
    .mockResolvedValueOnce(
      response(
        Array.from({ length: 50 }, (_, i) => candidate(i)),
        "page-2"
      )
    )
    .mockReturnValueOnce(next.promise);
  const onReplace = vi.fn();
  render(
    <V3TargetCascader
      literal="give"
      targets={[]}
      onReplace={onReplace}
      targetKind="word"
    />
  );
  fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  expect(search).toHaveBeenCalledTimes(2);
  expect(search.mock.calls[1]![0]).toEqual({
    schema_version: 3,
    q: "give",
    match: "exact",
    include_drafts: false,
    kind: "word",
    page_size: 50,
    cursor: "page-2"
  });
  expect(screen.getByText("give 0")).toBeVisible();
  next.resolve(response([candidate(50)]));
  fireEvent.click(await screen.findByText("give 50"));
  fireEvent.click(await screen.findByText("原形 give"));
  fireEvent.click(await screen.findByText("释义 50"));
  expect(onReplace).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        target_word_id: "entry-50",
        target_pos_id: "pos-50",
        target_base_form_id: "form-50",
        target_form_id: "form-50",
        target_variant_id: "variant-50",
        target_sense_id: "sense-50"
      })
    ],
    undefined
  );
  expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
});

it("默认仅发布候选，主动展开草稿重新查首页且忽略旧分页响应", async () => {
  const latePage = pending<SearchComponentTargetsV3Response>();
  search
    .mockResolvedValueOnce(response([candidate(0)], "published-page-2"))
    .mockReturnValueOnce(latePage.promise)
    .mockResolvedValueOnce(response([candidate(1)]))
    .mockResolvedValueOnce(response([candidate(0)]));
  const onReplace = vi.fn();
  render(
    <V3TargetCascader literal="give" targets={[]} onReplace={onReplace} />
  );
  fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
  expect(search.mock.calls[0]![0].include_drafts).toBe(false);
  fireEvent.click(screen.getByRole("checkbox", { name: "显示草稿候选" }));
  await screen.findByText("give 1");
  expect(search.mock.calls[2]![0]).toEqual(
    expect.objectContaining({ include_drafts: true })
  );
  expect(search.mock.calls[2]![0]).not.toHaveProperty("cursor");
  latePage.resolve(response([candidate(2)]));
  await waitFor(() =>
    expect(screen.queryByText("give 2")).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "显示草稿候选" }));
  await screen.findByText("give 0");
  expect(search.mock.calls[3]![0].include_drafts).toBe(false);
  expect(search.mock.calls[3]![0]).not.toHaveProperty("cursor");
  expect(onReplace).not.toHaveBeenCalled();
});

it.each([true, false])(
  "同词条发布与草稿共存时按具体节点标识依赖（草稿先到=%s）",
  async (draftFirst) => {
    const published = candidate(0);
    const draft = structuredClone(published);
    delete draft.publication_id;
    delete draft.senses[0]!.publication_id;
    draft.senses[0]!.gloss = "已有词义草稿文案";
    draft.senses.push({
      ...draft.senses[0]!,
      sense_id: "new-sense",
      gloss: "新增未发布词义"
    });
    search.mockResolvedValue(
      response(draftFirst ? [draft, published] : [published, draft])
    );
    const onReplace = vi.fn();
    render(
      <V3TargetCascader literal="give" targets={[]} onReplace={onReplace} />
    );
    fireEvent.click(await screen.findByText("give 0"));
    fireEvent.click(await screen.findByText("原形 give"));
    expect(screen.getAllByText("未发布目标")).toHaveLength(1);
    fireEvent.click(screen.getByText("释义 0"));
    expect(onReplace).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          target_publication_id: "pub-0",
          target_sense_id: "sense-0"
        })
      ],
      undefined
    );
    fireEvent.click(screen.getByText("新增未发布词义"));
    expect(onReplace.mock.lastCall![0][0]).toMatchObject({
      target_sense_id: "new-sense"
    });
    expect(onReplace.mock.lastCall![0][0]).not.toHaveProperty(
      "target_publication_id"
    );
  }
);

it("跨页同词条合并词形和词义，不重复第一列或丢后页词义", async () => {
  const first = candidate(0);
  const second = {
    ...candidate(0),
    senses: [
      ...first.senses,
      { ...first.senses[0]!, sense_id: "other-sense", gloss: "第二词义" }
    ]
  };
  search
    .mockResolvedValueOnce(response([first], "next"))
    .mockResolvedValueOnce(response([second]));
  render(<V3TargetCascader literal="give" targets={[]} onReplace={vi.fn()} />);
  fireEvent.click(await screen.findByText("give 0"));
  fireEvent.click(await screen.findByText("原形 give"));
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  expect(await screen.findByText("第二词义")).toBeVisible();
  expect(screen.getAllByText("give 0")).toHaveLength(1);
  expect(screen.getAllByText("原形 give")).toHaveLength(1);
  expect(screen.getAllByText("释义 0")).toHaveLength(1);
});

it("追加失败保留当前路径，重试复用同一游标而不重取首页", async () => {
  search
    .mockResolvedValueOnce(response([candidate(0)], "next"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(response([candidate(1)]));
  const onReplace = vi.fn();
  render(
    <V3TargetCascader literal="give" targets={[]} onReplace={onReplace} />
  );
  fireEvent.click(await screen.findByText("give 0"));
  fireEvent.click(await screen.findByText("原形 give"));
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  fireEvent.click(await screen.findByRole("button", { name: "重试加载更多" }));
  expect(await screen.findByText("give 1")).toBeVisible();
  expect(screen.getByText("释义 0")).toBeVisible();
  expect(search.mock.calls.slice(1).map(([input]) => input.cursor)).toEqual([
    "next",
    "next"
  ]);
  expect(onReplace).not.toHaveBeenCalled();
});

it("过滤后首批为空仍能继续加载，旧后端无游标截断不能误报已加载全部", async () => {
  search
    .mockResolvedValueOnce(response([candidate(0)], "next"))
    .mockResolvedValueOnce({ ...response([candidate(1)]), truncated: true });
  render(
    <V3TargetCascader
      literal="give"
      selfEntryId="entry-0"
      targets={[]}
      onReplace={vi.fn()}
    />
  );
  expect(
    await screen.findByText("已加载的候选中没有可关联的词条")
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  expect(await screen.findByText("give 1")).toBeVisible();
  expect(
    screen.getByText("候选未完整返回，当前服务暂不支持继续加载。")
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
});

it("游标失效保留已有选择，重新加载不再发送旧游标", async () => {
  const error = new HttpError(400, "stale", [], "invalid_query", {
    type: "about:blank",
    title: "stale",
    detail: "cursor expired",
    status: 400,
    code: "invalid_query",
    field: "cursor"
  });
  search
    .mockResolvedValueOnce(response([candidate(0)], "stale"))
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(response([candidate(1)]));
  const selected = {
    state: "resolved" as const,
    target_word_id: "entry-0",
    target_publication_id: "pub-0",
    target_pos_id: "pos-0",
    target_base_form_id: "form-0",
    target_form_id: "form-0",
    target_variant_id: "variant-0",
    target_sense_id: "sense-0",
    target_dialect: "common" as const,
    target_form_type: "base",
    target_headword: "give 0",
    target_gloss: "释义 0"
  };
  const onReplace = vi.fn();
  render(
    <V3TargetCascader
      literal="give"
      targets={[selected]}
      onReplace={onReplace}
    />
  );
  fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
  expect(
    await screen.findByText("词库已更新，请重新加载候选；已有关联保留。")
  ).toBeVisible();
  expect(screen.getByText("give 0")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(await screen.findByText("give 1")).toBeVisible();
  expect(search.mock.calls[2]![0]).not.toHaveProperty("cursor");
  expect(onReplace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "清除关联" })).toBeVisible();
});

it("换词面后忽略上一查询的迟到分页，并取消旧请求", async () => {
  const delayed = pending<SearchComponentTargetsV3Response>();
  search
    .mockResolvedValueOnce(response([candidate(0)], "next"))
    .mockReturnValueOnce(delayed.promise)
    .mockResolvedValueOnce(response([candidate(2)]));
  const onReplace = vi.fn();
  const { rerender } = render(
    <V3TargetCascader literal="give" targets={[]} onReplace={onReplace} />
  );
  fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
  const oldSignal = search.mock.calls[1]![1] as AbortSignal;
  rerender(
    <V3TargetCascader literal="take" targets={[]} onReplace={onReplace} />
  );
  expect(await screen.findByText("give 2")).toBeVisible();
  expect(oldSignal.aborted).toBe(true);
  delayed.resolve(response([candidate(1)]));
  await waitFor(() => expect(screen.queryByText("give 1")).toBeNull());
  expect(screen.queryByText("give 0")).toBeNull();
});
