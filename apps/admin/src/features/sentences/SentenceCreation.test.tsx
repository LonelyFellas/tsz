import { useState } from "react";
import { sentenceWord, sentenceTarget, sentenceCandidate } from "./fixtures";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { SharedSentence, SharedSentenceContent } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WordSentences } from "./WordSentences";
import { api } from "@/lib/auth";
import { newSentence } from "./model";
import { SentenceEditor } from "./SentenceEditor";
import { SharedSentenceAssociationPicker } from "./SharedSentenceAssociationPicker";

vi.mock("@/lib/env", () => ({
  env: { VOICE_EDITOR: true, VOICE_PREVIEW: false, VOICE_AUDIO_UPLOAD: false }
}));
vi.mock("@/lib/auth", () => ({
  useAuthStore: (
    select: (state: { profile: null; setProfile: () => void }) => unknown
  ) => select({ profile: null, setProfile: vi.fn() }),
  api: {
    sentences: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      targets: vi.fn(),
      unlink: vi.fn()
    }
  }
}));
vi.mock("../dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: undefined,
  adminAudioUploadAdapter: undefined,
  voicePreviewIsMock: false
}));

vi.mock("../dictionary/word-creation-v3/api", () => ({
  createV3WordRequests: () => ({
    searchComponentTargets: async ({ q }: { q: string }) => ({
      matches: q === "make up" ? [sentenceCandidate()] : [],
      truncated: false
    })
  })
}));
function SenseSentences({ readOnly }: { readOnly?: boolean }) {
  const [editor, setEditor] = useState<SharedSentence | "new">();
  return (
    <WordSentences
      sourceWord={sentenceWord()}
      senseId="sense"
      readOnly={readOnly}
      editor={editor}
      onOpen={setEditor}
      onClose={() => setEditor(undefined)}
    />
  );
}
function shared(content: SharedSentenceContent): SharedSentence {
  return {
    id: content.sentence.id,
    revision: 1,
    content,
    entries: [],
    created_by: "测试",
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z"
  };
}
function show(ui: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ConfigProvider locale={zhCN} theme={{ token: { motion: false } }}>
        <App>{ui}</App>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.sentences.list).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.sentences.targets).mockImplementation(async (query) => ({
    items:
      query.entry_id || query.q === "make up"
        ? [
            {
              id: "entry",
              headword: "make up",
              kind: "phrase",
              surfaces: [
                { surface: "make up", dialect: "uk" },
                { surface: "make up", dialect: "us" }
              ]
            }
          ]
        : [],
    total: query.entry_id || query.q === "make up" ? 1 : 0
  }));
});

describe("按词条关联反查共享多维例句", () => {
  it("未保存的新词义禁用添加，保存后按具体词义查询", async () => {
    const word = sentenceWord();
    const original = structuredClone(word.meanings.pos[0]!.senses[0]!);
    word.meanings.pos[0]!.senses = [];
    const open = vi.fn();
    const view = show(
      <WordSentences
        sourceWord={word}
        senseId="sense"
        onOpen={open}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("先保存词义，再添加例句。")).toBeVisible();
    expect(screen.getByRole("button", { name: "添加例句" })).toBeDisabled();
    expect(api.sentences.list).not.toHaveBeenCalled();
    view.unmount();
    word.meanings.pos[0]!.senses = [original];
    word.revision = 2;
    show(
      <WordSentences
        sourceWord={word}
        senseId="sense"
        onOpen={open}
        onClose={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(api.sentences.list).toHaveBeenCalledWith({
        entry_id: "entry",
        sense_id: "sense",
        page: 1,
        page_size: 5
      })
    );
    expect(screen.getByRole("button", { name: "添加例句" })).toBeEnabled();
  });
  it("待关联词面锁定选中的 make，提交不接受自由输入的其他词面", async () => {
    const select = vi.fn();
    show(
      <SharedSentenceAssociationPicker
        kind="word"
        segments={[{ start: 3, end: 7, surface: "make" }]}
        dialect="common"
        labels={{}}
        onTargetLabel={vi.fn()}
        onSelect={select}
      />
    );
    fireEvent.click(
      screen.getByRole("radio", { name: "词条未创建，记为待关联" })
    );
    const headword = screen.getByRole("textbox", { name: "待关联词面" });
    expect(headword).toHaveValue("make");
    expect(headword).toHaveAttribute("readonly");
    fireEvent.change(headword, { target: { value: "make1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "待关联释义" }), {
      target: { value: "制造" }
    });
    expect(headword).toHaveValue("make");
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        source_segments: [{ start: 3, end: 7, surface: "make" }],
        target: {
          state: "pending",
          kind: "word",
          headword: "make",
          gloss: "制造"
        }
      })
    );
  });
  it("每条例句展示全部非空译文并按初中高排列，保留两条高阶译文", async () => {
    const content = newSentence();
    if (content.sentence.en_text.mode === "unified")
      content.sentence.en_text.common.value.text = "A translated example.";
    const translations = content.sentence.zh_translations;
    ["初阶译文内容", "中阶译文内容", "高阶译文一", "高阶译文二"].forEach(
      (text, index) => {
        translations[index]!.content.text = text;
      }
    );
    content.sentence.zh_translations = [
      translations[2]!,
      translations[0]!,
      translations[3]!,
      translations[1]!,
      {
        ...translations[1]!,
        id: crypto.randomUUID(),
        content: { version: 2, text: " \n\t ", annotations: [] }
      }
    ];
    vi.mocked(api.sentences.list).mockResolvedValue({
      items: [shared(content)],
      total: 1
    });
    show(<SenseSentences readOnly />);
    await screen.findByText("初阶译文内容");
    const row = screen
      .getByText("A translated example.")
      .closest(".shared-sentence-row") as HTMLElement;
    const rows = within(row).getAllByRole("group");
    expect(rows.map((item) => item.getAttribute("aria-label"))).toEqual([
      "初阶译文",
      "中阶译文",
      "高阶译文",
      "高阶译文"
    ]);
    ["初阶译文内容", "中阶译文内容", "高阶译文一", "高阶译文二"].forEach(
      (text, index) => {
        expect(rows[index]).toHaveTextContent(text);
      }
    );
    expect(within(row).getAllByText("中阶译文内容")).toHaveLength(1);
  });
  it("重新编辑不补模板，手动添加后保存去掉空行，再次打开只保留有效译文", async () => {
    const content = newSentence();
    if (content.sentence.en_text.mode === "unified")
      content.sentence.en_text.common.value.text = "A translated example.";
    const original = content.sentence.zh_translations[0]!;
    original.content.text = "保留原来的译文。";
    content.sentence.zh_translations = [original];
    content.sentence.zh_text_id = original.id;
    content.sentence.zh_text = original.content;
    const item = shared(content);
    const onSaved = vi.fn();
    vi.mocked(api.sentences.update).mockImplementation(async (_id, input) =>
      shared(input.content)
    );
    const view = show(
      <SentenceEditor sentence={item} onClose={vi.fn()} onSaved={onSaved} />
    );
    await screen.findByRole("toolbar", { name: "标注工具栏" });
    expect(
      screen.queryByRole("button", { name: "打开例句正文编辑器" })
    ).toBeNull();
    expect(screen.getAllByPlaceholderText("请输入对应的中文译文")).toHaveLength(
      1
    );
    const english = screen.getByRole("textbox", { name: "例句正文" });
    expect(english).not.toHaveAttribute("readonly");
    fireEvent.change(english, { target: { value: "An updated example." } });
    for (const tier of ["中阶", "高阶"]) {
      fireEvent.click(screen.getByRole("button", { name: "添加例句 1 译文" }));
      fireEvent.click(
        await screen.findByRole("menuitem", { name: new RegExp(`^${tier}`) })
      );
    }
    const inputs = screen.getAllByPlaceholderText("请输入对应的中文译文");
    expect(inputs).toHaveLength(3);
    fireEvent.change(inputs[1]!, { target: { value: " \n\t " } });
    fireEvent.change(inputs[2]!, { target: { value: "新增高阶译文。" } });
    fireEvent.click(screen.getByRole("button", { name: "完成例句编辑" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.sentences.update).mock.calls[0]![1].content
      .sentence;
    expect(
      saved.en_text.mode === "unified" && saved.en_text.common.value.text
    ).toBe("An updated example.");
    expect(saved.zh_translations).toEqual([
      original,
      expect.objectContaining({
        band: "adapted_creation",
        content: { version: 2, text: "新增高阶译文。", annotations: [] }
      })
    ]);
    expect(saved.zh_text_id).toBe(original.id);
    expect(saved.zh_text).toEqual(original.content);
    expect(item.content.sentence.zh_translations).toEqual([original]);
    view.unmount();
    show(
      <SentenceEditor
        sentence={onSaved.mock.calls[0]![0]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getAllByPlaceholderText("请输入对应的中文译文")).toHaveLength(
      2
    );
    expect(screen.getByDisplayValue("保留原来的译文。")).toBeInTheDocument();
    expect(screen.getByDisplayValue("新增高阶译文。")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "例句 1 中阶译文组" })
    ).toBeNull();
  });
  it.each([
    {
      text: "We make up a story.",
      typo: "We makke up a story.",
      segments: [{ start: 3, end: 10, surface: "make up" }]
    },
    {
      text: "We make the story up.",
      typo: "We makke the story up.",
      segments: [
        { start: 3, end: 7, surface: "make" },
        { start: 18, end: 20, surface: "up" }
      ]
    }
  ])(
    "改错再改回原句自动恢复之前确认的关联：$text",
    async ({ text, typo, segments }) => {
      const content = newSentence();
      if (content.sentence.en_text.mode === "unified")
        content.sentence.en_text.common.value.text = text;
      content.sentence.zh_translations[0]!.content.text = "我们编造这个故事。";
      content.annotations = [
        {
          id: "confirmed-link",
          source_dialect: "common",
          source_segments: segments,
          target: sentenceTarget()
        }
      ];
      vi.mocked(api.sentences.update).mockImplementation(async (_id, input) =>
        shared(input.content)
      );
      show(
        <SentenceEditor
          sentence={shared(content)}
          sourceWord={sentenceWord()}
          sourceSenseId="sense"
          onSaved={vi.fn()}
          onClose={vi.fn()}
        />
      );
      await screen.findByRole("toolbar", { name: "标注工具栏" });
      await screen.findByText("已关联当前词义：make up · 编造（故事、借口等）");
      const input = screen.getByRole("textbox", { name: "例句正文" });
      fireEvent.change(input, { target: { value: typo } });
      expect(
        screen.getByRole("button", { name: "完成例句编辑" })
      ).toBeDisabled();
      fireEvent.change(input, { target: { value: text } });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "完成例句编辑" })
        ).toBeEnabled()
      );
      expect(screen.queryByText(/正文变化使部分原标注位置失效/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "完成例句编辑" }));
      await waitFor(() => expect(api.sentences.update).toHaveBeenCalledOnce());
      expect(
        vi.mocked(api.sentences.update).mock.calls[0]![1].content.annotations
      ).toEqual(content.annotations);
    }
  );

  it("必须确认当前词义关联，独立保存失败保留输入，重试不重复创建", async () => {
    vi.mocked(api.sentences.create)
      .mockRejectedValueOnce(new Error("网络暂时不可用"))
      .mockImplementationOnce(async (input) => {
        const item = shared(input.content);
        vi.mocked(api.sentences.list).mockResolvedValue({
          items: [item],
          total: 1
        });
        return item;
      });
    show(<SenseSentences />);
    fireEvent.click(screen.getByRole("button", { name: "添加例句" }));
    await screen.findByRole("toolbar", { name: "标注工具栏" });
    expect(
      screen.queryByRole("button", { name: "打开例句正文编辑器" })
    ).toBeNull();
    const templateInputs =
      screen.getAllByPlaceholderText("请输入对应的中文译文");
    expect(templateInputs).toHaveLength(4);
    expect(
      screen
        .getAllByRole("group", { name: /译文组$/ })
        .map((group) => within(group).getAllByRole("textbox").length)
    ).toEqual([1, 1, 2]);
    const text = screen.getByRole("textbox", { name: "例句正文" });
    expect(text).not.toHaveAttribute("readonly");
    fireEvent.change(text, { target: { value: "We make up stories." } });
    fireEvent.change(
      screen.getAllByPlaceholderText("请输入对应的中文译文")[0]!,
      { target: { value: "我们编故事。" } }
    );
    expect(screen.getByRole("button", { name: "完成例句编辑" })).toBeDisabled();
    fireEvent.click(
      await screen.findByRole("button", { name: /确认关联 make up/ })
    );
    await screen.findByText("已关联当前词义：make up · 编造（故事、借口等）");
    fireEvent.click(screen.getByRole("button", { name: "完成例句编辑" }));
    await screen.findByText("网络暂时不可用");
    expect(text).toHaveValue("We make up stories.");
    fireEvent.click(screen.getByRole("button", { name: "完成例句编辑" }));
    await screen.findByText("We make up stories.");
    const [first, retry] = vi.mocked(api.sentences.create).mock.calls;
    expect(first![0]).toEqual(retry![0]);
    expect(retry![0]).toHaveProperty("source_sense_id", "sense");
    expect(retry![0].content.annotations[0]!.target).toEqual(sentenceTarget());
    expect(api.sentences.list).toHaveBeenLastCalledWith({
      entry_id: "entry",
      sense_id: "sense",
      page: 1,
      page_size: 5
    });
    expect(screen.queryByText(/保存当前词义后/)).toBeNull();
  });
  it("复用正文关联单词和短语工具，保存非连续片段及待关联信息", async () => {
    vi.mocked(api.sentences.create).mockImplementation(async (input) =>
      shared(input.content)
    );
    show(<SenseSentences />);
    fireEvent.click(screen.getByRole("button", { name: "添加例句" }));
    await screen.findByRole("toolbar", { name: "标注工具栏" });
    fireEvent.change(screen.getByRole("textbox", { name: "例句正文" }), {
      target: { value: "We make the story up." }
    });
    fireEvent.change(
      screen.getAllByPlaceholderText("请输入对应的中文译文")[0]!,
      { target: { value: "我们编造这个故事。" } }
    );
    const toolbar = await screen.findByRole("toolbar", { name: "标注工具栏" });
    expect(screen.queryByText("句内关联")).toBeNull();
    fireEvent.click(within(toolbar).getByRole("button", { name: "关联单词" }));
    fireEvent.mouseDown(screen.getByLabelText("关联 story（4）"), {
      button: 0
    });
    const wordPicker = await screen.findByRole("group", {
      name: "关联单词：story"
    });
    fireEvent.click(
      within(wordPicker).getByRole("radio", { name: "词条未创建，记为待关联" })
    );
    fireEvent.change(
      within(wordPicker).getByRole("textbox", { name: "待关联释义" }),
      {
        target: { value: "故事" }
      }
    );
    fireEvent.click(
      within(wordPicker).getByRole("button", { name: "确认关联" })
    );
    fireEvent.click(within(toolbar).getByRole("button", { name: "关联短语" }));
    fireEvent.mouseDown(screen.getByLabelText("关联 make（2）"), { button: 0 });
    fireEvent.mouseDown(screen.getByLabelText("关联 up.（5）"), { button: 0 });
    fireEvent.click(
      await screen.findByRole("button", { name: "选择关联短语" })
    );
    const phrasePicker = await screen.findByRole("group", {
      name: "关联短语：make up"
    });
    fireEvent.click(
      await within(phrasePicker).findByText("make up", { selector: "strong" })
    );
    fireEvent.click(await within(phrasePicker).findByText(/原形 make up/));
    fireEvent.click(
      await within(phrasePicker).findByText("编造（故事、借口等）")
    );
    await waitFor(() =>
      expect(
        within(phrasePicker).getByRole("button", { name: "确认关联" })
      ).toBeEnabled()
    );
    fireEvent.click(
      within(phrasePicker).getByRole("button", { name: "确认关联" })
    );
    fireEvent.click(screen.getByRole("button", { name: "完成例句编辑" }));
    await waitFor(() => expect(api.sentences.create).toHaveBeenCalledOnce());
    const annotations = vi.mocked(api.sentences.create).mock.calls[0]![0]
      .content.annotations;
    expect(annotations).toEqual([
      expect.objectContaining({
        source_dialect: "common",
        source_segments: [{ start: 12, end: 17, surface: "story" }],
        target: {
          state: "pending",
          kind: "word",
          headword: "story",
          gloss: "故事"
        }
      }),
      expect.objectContaining({
        source_dialect: "common",
        source_segments: [
          { start: 3, end: 7, surface: "make" },
          { start: 18, end: 20, surface: "up" }
        ],
        target: sentenceTarget()
      })
    ]);
  });

  it("解除当前词义时发送例句版本，刷新反查列表而不删除全局例句", async () => {
    const content = newSentence();
    if (content.sentence.en_text.mode === "unified")
      content.sentence.en_text.common.value.text = "We make the story up.";
    const item = shared(content);
    vi.mocked(api.sentences.list).mockResolvedValue({
      items: [item],
      total: 1
    });
    vi.mocked(api.sentences.unlink).mockImplementation(async () => {
      vi.mocked(api.sentences.list).mockResolvedValue({ items: [], total: 0 });
    });
    show(<SenseSentences />);
    await screen.findByText("We make the story up.");
    fireEvent.click(screen.getByRole("button", { name: "从当前词义解除关联" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /确\s*定/
      })
    );
    await screen.findByText("暂无关联例句");
    expect(api.sentences.unlink).toHaveBeenCalledWith(item.id, "entry", {
      base_revision: 1,
      sense_id: "sense"
    });
  });
});
