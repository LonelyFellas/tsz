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
import type { SharedSentence, SharedSentenceAnnotation } from "@tsz/types";
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
vi.mock("../dictionary/word-creation-v3/api", () => ({
  createV3WordRequests: () => ({ searchComponentTargets: searchTargets })
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
beforeEach(() => {
  vi.resetAllMocks();
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
    fireEvent.click(await screen.findByText(/原形 make/));
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
    fireEvent.click(await screen.findByText(/原形 make/));
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
        include_drafts: true
      })
    );
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
    fireEvent.click(await screen.findByText(/原形 color/));
    fireEvent.click(await screen.findByText("编造（故事、借口等）"));
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        source_dialect: "us",
        target: sentenceTarget("source")
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
