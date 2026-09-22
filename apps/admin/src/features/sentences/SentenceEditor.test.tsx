import { sentenceWord, sentenceTarget, sentenceCandidate } from "./fixtures";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SharedSentence,
  SharedSentenceAnnotation,
  PublishedSentenceTargetCandidateV3,
  ResolveSentenceTargetsV3Response,
  ResolveSentenceTargetsV3Input
} from "@tsz/types";
import { SentenceEditor } from "./SentenceEditor";
import { SharedSentenceAssociationPicker } from "./SharedSentenceAssociationPicker";
import { newSentence } from "./model";
import { api } from "@/lib/auth";
vi.mock("@/lib/env", () => ({
  env: { VOICE_EDITOR: true, VOICE_PREVIEW: false, VOICE_AUDIO_UPLOAD: false }
}));
vi.mock("../dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: undefined,
  adminAudioUploadAdapter: undefined,
  voicePreviewIsMock: false
}));
vi.mock("../dictionary/word-creation/PronunciationPreview", () => ({
  PronunciationPreviewProvider: ({
    children
  }: {
    children: React.ReactNode;
  }) => <>{children}</>
}));
vi.mock("@/lib/auth", () => ({
  useAuthStore: (
    select: (state: { profile: null; setProfile: () => void }) => unknown
  ) => select({ profile: null, setProfile: vi.fn() }),
  api: { sentences: { targets: vi.fn(), update: vi.fn(), create: vi.fn() } }
}));
const searchTargets = vi.hoisted(() => vi.fn());
const discoverTargets = vi.hoisted(() => vi.fn());
vi.mock("../dictionary/word-creation-v3/api", () => ({
  createV3WordRequests: () => ({
    searchComponentTargets: searchTargets,
    resolveSentenceTargets: discoverTargets
  })
}));
const target = {
  id: "source",
  headword: "make",
  kind: "word",
  surfaces: [{ surface: "make", dialect: "uk" }]
};
function example(annotations: SharedSentenceAnnotation[] = []): SharedSentence {
  const content = newSentence();
  if (content.sentence.en_text.mode === "unified")
    content.sentence.en_text.common.value.text = "We make stories.";
  content.sentence.zh_translations[0]!.content.text = "我们编故事。";
  content.annotations = annotations;
  return {
    id: content.sentence.id,
    content,
    revision: 3,
    entries: [],
    created_by: "测试",
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z"
  };
}
function show(ui: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>{ui}</App>
    </QueryClientProvider>
  );
}
function discoveryResponse(
  published: PublishedSentenceTargetCandidateV3[],
  drafts: PublishedSentenceTargetCandidateV3[] = []
): ResolveSentenceTargetsV3Response {
  return {
    schema_version: 3,
    sentence_hash: "sentence-hash",
    discovery_generation: 1,
    completeness: "complete",
    range_results: [
      {
        source_segments: [{ start: 3, end: 7, surface: "make" }],
        normalized_surface: "make",
        segments_fingerprint: "make-range",
        published_total: published.length,
        draft_total: drafts.length,
        published_matches: published,
        draft_matches: drafts
      }
    ]
  };
}
function publishedCandidate() {
  const candidate = sentenceCandidate("target", "make");
  candidate.publication_id = "target-publication";
  candidate.senses.forEach((sense) => {
    sense.publication_id = "target-publication";
  });
  return candidate;
}
beforeEach(() => {
  vi.resetAllMocks();
  discoverTargets.mockResolvedValue(discoveryResponse([]));
  searchTargets.mockResolvedValue({
    matches: [sentenceCandidate("source", "make")],
    truncated: false
  });
  vi.mocked(api.sentences.targets).mockResolvedValue({
    items: [target],
    total: 1
  });
});
describe("当前词条关联与离开保护", () => {
  it("后端明确关闭发现能力时隐藏发现入口，保留例句编辑", () => {
    const sourceWord = sentenceWord("source", "make");
    sourceWord.capabilities.sentence_target_discovery = false;
    show(
      <SentenceEditor
        sentence={example()}
        sourceWord={sourceWord}
        sourceSenseId="sense"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "一键发现" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "例句正文" })).toBeEnabled();
    expect(discoverTargets).not.toHaveBeenCalled();
  });

  it("自动发现接入真实请求接口形状，选择只更新抽屉，完成时保存具体节点", async () => {
    const current = example();
    discoverTargets.mockResolvedValue(
      discoveryResponse([publishedCandidate()])
    );
    vi.mocked(api.sentences.update).mockImplementation(async (_id, input) => ({
      ...current,
      content: input.content,
      revision: 4
    }));
    const onSaved = vi.fn();
    show(
      <SentenceEditor sentence={current} onClose={vi.fn()} onSaved={onSaved} />
    );
    expect(discoverTargets).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await waitFor(() =>
      expect(discoverTargets).toHaveBeenCalledWith(
        {
          schema_version: 3,
          mode: "all_published_targets",
          sentence_text: "We make stories.",
          source_dialect: "common",
          page_size_per_range: 50
        },
        expect.any(AbortSignal)
      )
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看 1 个词义" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "关联词义：编造（故事、借口等）" })
    );
    expect(api.sentences.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("完成例句编辑"));
    await waitFor(() => expect(api.sentences.update).toHaveBeenCalledTimes(1));
    expect(
      vi.mocked(api.sentences.update).mock.calls[0]![1].content.annotations
    ).toEqual([
      expect.objectContaining({
        source_dialect: "common",
        source_segments: [{ start: 3, end: 7, surface: "make" }],
        target: {
          ...sentenceTarget("target"),
          target_publication_id: "target-publication"
        }
      })
    ]);
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 4 })
      )
    );
  });

  it("主动展开已发布词条的新增草稿词义，保存时不误带旧发布号", async () => {
    const current = example();
    const published = publishedCandidate();
    const draft = sentenceCandidate("target", "make");
    draft.senses[0]!.sense_id = "new-draft-sense";
    draft.senses[0]!.gloss = "新增草稿词义";
    discoverTargets.mockImplementation(
      async (input: ResolveSentenceTargetsV3Input) =>
        discoveryResponse(
          [published],
          input.mode === "selected_segments" && input.include_drafts
            ? [draft]
            : []
        )
    );
    vi.mocked(api.sentences.update).mockImplementation(async (_id, input) => ({
      ...current,
      content: input.content,
      revision: 4
    }));
    show(
      <SentenceEditor sentence={current} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText("手动选择"));
    fireEvent.click(screen.getByRole("button", { name: "选择第 2 个词 make" }));
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    await screen.findByText("已发布");
    expect(discoverTargets.mock.calls[0]![0].include_drafts).toBe(false);
    expect(screen.queryByText("草稿候选")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "显示草稿候选" }));
    expect(discoverTargets).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    const card = (await screen.findByText("草稿候选")).closest("article")!;
    expect(discoverTargets.mock.calls[1]![0].include_drafts).toBe(true);
    expect(within(card).getByText(/具体目标尚未发布/)).toBeVisible();
    fireEvent.click(
      within(card).getByRole("button", { name: "查看 1 个词义" })
    );
    fireEvent.click(
      within(card).getByRole("button", { name: "关联词义：新增草稿词义" })
    );
    expect(api.sentences.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("完成例句编辑"));
    await waitFor(() => expect(api.sentences.update).toHaveBeenCalledTimes(1));
    const annotation = vi.mocked(api.sentences.update).mock.calls[0]![1].content
      .annotations[0]!;
    expect(annotation.target).toEqual({
      ...sentenceTarget("target"),
      target_sense_id: "new-draft-sense"
    });
    expect(annotation.target).not.toHaveProperty("target_publication_id");
  });

  it("发现结果不覆盖已有标注，也不能绕过当前词义的关联要求", async () => {
    const original: SharedSentenceAnnotation = {
      id: "existing",
      source_dialect: "common",
      source_segments: [{ start: 3, end: 7, surface: "make" }],
      target: sentenceTarget("source")
    };
    discoverTargets.mockResolvedValue(
      discoveryResponse([publishedCandidate()])
    );
    const current = example([original]);
    vi.mocked(api.sentences.update).mockImplementation(async (_id, input) => ({
      ...current,
      content: input.content,
      revision: 4
    }));
    show(
      <SentenceEditor
        sentence={current}
        sourceWord={sentenceWord("source", "make")}
        sourceSenseId="sense"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    expect(
      await screen.findByText("该片段已有标注，请先清除或修改原关联")
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "查看 1 个词义" }));
    expect(
      screen.getByRole("button", { name: "关联词义：编造（故事、借口等）" })
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText("完成例句编辑"));
    await waitFor(() => expect(api.sentences.update).toHaveBeenCalledTimes(1));
    expect(
      vi.mocked(api.sentences.update).mock.calls[0]![1].content.annotations
    ).toEqual([original]);
  });

  it.each(["made", "make"])(
    "调序后首候选文案跟随配置，%s 不会自动绑定或绕过同拼写歧义保护",
    async (spelling) => {
      const word = sentenceWord("source", "make");
      const pos = word.forms.pos[0]!;
      const past = structuredClone(pos.forms[0]!);
      past.id = "past";
      past.form_type = "past_tense";
      if (past.regional_variants.mode !== "common")
        throw new Error("fixture must be common");
      past.regional_variants.common.id = "past-variant";
      past.regional_variants.common.spelling = spelling;
      pos.forms.push(past);
      pos.form_groups = [
        {
          id: "group",
          is_regular: true,
          scope: "general",
          dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
          members: [
            { id: "past-member", form_id: "past" },
            { id: "base-member", form_id: pos.forms[0]!.id }
          ]
        }
      ];
      show(
        <SentenceEditor
          sentence={example()}
          sourceWord={word}
          sourceSenseId="sense"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );
      await screen.findByText(new RegExp(`请关联当前词义：${spelling}`));
      const shortcut = screen.queryByRole("button", { name: /确认关联 make/ });
      if (spelling === "make") expect(shortcut).not.toBeInTheDocument();
      else expect(shortcut).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "完成例句编辑" })
      ).toBeDisabled();
      expect(api.sentences.update).not.toHaveBeenCalled();
      expect(api.sentences.create).not.toHaveBeenCalled();
    }
  );
  it.each(["homograph", "pending", "other-sense", "entry_only"])(
    "%s 不能满足当前关联，但仍允许进入编辑器修复",
    async (state) => {
      const annotation: SharedSentenceAnnotation = {
        id: "a",
        source_dialect: "common",
        source_segments: [{ start: 3, end: 7, surface: "make" }],
        target:
          state === "pending"
            ? { state: "pending", kind: "word", headword: "make" }
            : state === "entry_only"
              ? { state: "entry_only", target_entry_id: "source" }
              : {
                  ...sentenceTarget(
                    state === "homograph" ? "other-make" : "source"
                  ),
                  target_sense_id:
                    state === "other-sense" ? "other-sense" : "sense"
                }
      };
      show(
        <SentenceEditor
          sentence={example([annotation])}
          sourceWord={sentenceWord("source", "make")}
          sourceSenseId="sense"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );
      await screen.findByText(/请关联当前词义：make/);
      expect(screen.getByRole("textbox", { name: "例句正文" })).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "完成例句编辑" })
      ).toBeDisabled();
      expect(api.sentences.update).not.toHaveBeenCalled();
    }
  );
  it("旧词条级关联可以直接补选词义，保留片段和标注ID后保存", async () => {
    const old: SharedSentenceAnnotation = {
      id: "legacy-link",
      source_dialect: "common",
      source_segments: [{ start: 3, end: 7, surface: "make" }],
      target: { state: "entry_only", target_entry_id: "source" }
    };
    const item = example([old]);
    vi.mocked(api.sentences.update).mockImplementation(async (_id, input) => ({
      ...item,
      content: input.content,
      revision: 4
    }));
    show(
      <SentenceEditor
        sentence={item}
        sourceWord={sentenceWord("source", "make")}
        sourceSenseId="sense"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    const toolbar = await screen.findByRole("toolbar", { name: "标注工具栏" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "关联单词" }));
    fireEvent.mouseDown(screen.getByLabelText("关联 make（2）"), { button: 0 });
    await screen.findByText("旧关联尚未选择具体词义，请补全或清除。");
    fireEvent.click(
      await screen.findByText("make", {
        selector: ".v3-component-usage-entry strong"
      })
    );
    fireEvent.click(
      await screen.findByText(/原形 make/, {}, { timeout: 5000 })
    );
    fireEvent.click(await screen.findByText("编造（故事、借口等）"));
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));
    const done = screen.getByRole("button", { name: "完成例句编辑" });
    await waitFor(() => expect(done).toBeEnabled());
    fireEvent.click(done);
    await waitFor(() => expect(api.sentences.update).toHaveBeenCalledOnce());
    expect(vi.mocked(api.sentences.update).mock.calls[0]![1]).toMatchObject({
      context_entry_id: "source",
      context_sense_id: "sense",
      content: { annotations: [{ ...old, target: sentenceTarget("source") }] }
    });
  });
  it("关联层级为词条、匹配词形、词义，不能只选择词条就提交", async () => {
    const select = vi.fn();
    show(
      <SharedSentenceAssociationPicker
        kind="word"
        dialect="common"
        segments={[{ start: 3, end: 7, surface: "make" }]}
        labels={{}}
        onSelect={select}
        onTargetLabel={vi.fn()}
      />
    );
    fireEvent.click(
      await screen.findByText("make", {
        selector: ".v3-component-usage-entry strong"
      })
    );
    expect(screen.getByRole("button", { name: "确认关联" })).toBeDisabled();
    fireEvent.click(
      await screen.findByText(/原形 make/, {}, { timeout: 5000 })
    );
    expect(screen.getByRole("button", { name: "确认关联" })).toBeDisabled();
    fireEvent.click(await screen.findByText("编造（故事、借口等）"));
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ target: sentenceTarget("source") })
    );
    expect(searchTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "make",
        match: "exact",
        kind: "word",
        include_drafts: false
      }),
      expect.any(AbortSignal)
    );
  });
  it("已关联仍查询候选并可展开词形词义，但不能直接更换关联", async () => {
    searchTargets.mockResolvedValue({
      matches: [sentenceCandidate("source", "for")],
      truncated: false
    });
    const select = vi.fn();
    show(
      <SharedSentenceAssociationPicker
        kind="word"
        dialect="common"
        segments={[{ start: 0, end: 3, surface: "for" }]}
        selected={{
          id: "existing",
          source_dialect: "common",
          source_segments: [{ start: 0, end: 3, surface: "for" }],
          target: sentenceTarget("source")
        }}
        labels={{ "source:sense": "for · 对于" }}
        onSelect={select}
        onTargetLabel={vi.fn()}
      />
    );
    fireEvent.click(
      await screen.findByText("for", {
        selector: ".v3-component-usage-entry strong"
      })
    );
    expect(searchTargets).toHaveBeenCalledWith(
      expect.objectContaining({ q: "for", match: "exact", kind: "word" }),
      expect.any(AbortSignal)
    );
    fireEvent.click(await screen.findByText(/原形 for/, {}, { timeout: 5000 }));
    const sense = await screen.findByText("编造（故事、借口等）");
    expect(sense.closest("li")).toHaveClass("ant-cascader-menu-item-disabled");
    expect(sense.querySelector(".v3-component-usage-radio")).toHaveClass(
      "is-checked"
    );
    fireEvent.click(sense);
    fireEvent.keyDown(sense.closest("li")!, { key: "Enter" });
    expect(select).not.toHaveBeenCalled();
    expect(screen.queryByText("确认关联")).toBeNull();
    fireEvent.click(screen.getByText("清除关联"));
    expect(select).toHaveBeenCalledExactlyOnceWith(undefined);
  });
  it("正文方言匹配的词形不被管理员默认方言偏好过滤", async () => {
    const candidate = sentenceCandidate("source", "color");
    candidate.forms[0]!.dialect = "us";
    candidate.matched_dialect = "us";
    searchTargets.mockResolvedValue({ matches: [candidate], truncated: false });
    const select = vi.fn();
    show(
      <SharedSentenceAssociationPicker
        kind="word"
        dialect="us"
        segments={[{ start: 0, end: 5, surface: "color" }]}
        labels={{}}
        onSelect={select}
        onTargetLabel={vi.fn()}
      />
    );
    fireEvent.click(
      await screen.findByText("color", {
        selector: ".v3-component-usage-entry strong"
      })
    );
    fireEvent.click(
      await screen.findByText(/原形 color/, {}, { timeout: 5000 })
    );
    fireEvent.click(await screen.findByText("编造（故事、借口等）"));
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        source_dialect: "us",
        target: sentenceTarget("source", "us")
      })
    );
  });
  it("路由离开提供继续、放弃和独立保存；保存失败停留原页面并保留输入", async () => {
    const item = example();
    vi.mocked(api.sentences.update)
      .mockRejectedValueOnce(new Error("版本已变化"))
      .mockImplementationOnce(async (_id, input) => ({
        ...item,
        content: input.content,
        revision: 4
      }));
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <>
            <Link to="/next">离开词条</Link>
            <SentenceEditor
              sentence={item}
              onClose={vi.fn()}
              onSaved={vi.fn()}
            />
          </>
        )
      },
      { path: "/next", element: <div>下个页面</div> }
    ]);
    show(<RouterProvider router={router} />);
    fireEvent.change(
      screen.getAllByPlaceholderText("请输入对应的中文译文")[0]!,
      { target: { value: "保留我的修改" } }
    );
    fireEvent.click(screen.getByText("离开词条"));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" }));
    expect(router.state.location.pathname).toBe("/");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByText("离开词条"));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存例句后离开" })
    );
    await screen.findByText("版本已变化");
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByDisplayValue("保留我的修改")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByText("离开词条"));
    const retry = await screen.findByRole("button", { name: "保存例句后离开" });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await screen.findByText("下个页面");
    expect(api.sentences.update).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(api.sentences.update).mock.calls[0]![1]
    ).not.toHaveProperty("context_entry_id");
  });
});
