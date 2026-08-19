import { HttpError } from "@tsz/api-client/http";
import type {
  DraftMeaningsStepContent,
  EnglishTextV2,
  RichText
} from "@tsz/types";
import type { VoiceRichTextEditorProps } from "@tsz/voice-editor/editor";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  meaningDialectSuggestionBatchRunner,
  MeaningsAndExamplesStep
} from "./MeaningsAndExamplesStep";
import { collectPronunciationHints } from "./meaningsAndExamples/mapping";
import { createGrammar } from "./model";
import { deferred, wordFixture } from "./wordCreation.test.helper";

const mutations = vi.hoisted(() => ({
  save: vi.fn(),
  suggest: vi.fn()
}));
const dataSourceCapabilities = vi.hoisted(() => ({
  dialectVariantSuggestions: true
}));
const featureFlags = vi.hoisted(() => ({
  VOICE_EDITOR: false,
  VOICE_PREVIEW: false,
  ADMIN_TTS_MOCK: true,
  RELATED_SEARCH_V2: false,
  WORD_CONTENT_COMPLETION: false
}));
const relatedSearchV2State = vi.hoisted(() => ({
  exactHasNextPage: false,
  containsHasNextPage: false,
  missingPagination: false,
  legacyMixedResults: false,
  exactError: false,
  containsError: false,
  fetchNextExactPage: vi.fn(),
  fetchNextContainsPage: vi.fn(),
  refetchExact: vi.fn(),
  refetchContains: vi.fn()
}));
const voicePreview = vi.hoisted(() => ({
  listVoices: vi.fn(),
  synthesize: vi.fn()
}));
const relatedWords = vi.hoisted(() => [
  {
    word_id: "fixture-colour",
    headword: "colour",
    kind: "word" as const,
    dialects: ["common" as const],
    pos_labels: ["noun"],
    senses: [{ sense_id: "fixture-colour-sense", gloss: "颜色" }]
  },
  {
    word_id: "fixture-far",
    headword: "far",
    kind: "word" as const,
    dialects: ["common" as const],
    pos_labels: ["adjective"],
    senses: [{ sense_id: "fixture-far-sense", gloss: "远的" }]
  },
  {
    word_id: "fixture-blank",
    headword: "blank",
    kind: "word" as const,
    dialects: ["common" as const],
    pos_labels: ["adjective"],
    senses: [{ sense_id: "fixture-blank-sense", gloss: "" }]
  },
  {
    word_id: "11111111-workspace-first",
    headword: "workspace",
    kind: "word" as const,
    dialects: ["common" as const],
    pos_labels: ["noun"],
    senses: [{ sense_id: "workspace-first-sense", gloss: "工作区甲" }]
  },
  {
    word_id: "22222222-workspace-second",
    headword: "workspace",
    kind: "word" as const,
    dialects: ["common" as const],
    pos_labels: ["noun"],
    senses: [
      { sense_id: "workspace-second-sense-1", gloss: "工作区乙一" },
      { sense_id: "workspace-second-sense-2", gloss: "工作区乙二" }
    ]
  }
]);

vi.mock("../dataSource", () => ({
  adminWordsDataSourceCapabilities: dataSourceCapabilities
}));

vi.mock("@/lib/env", () => ({ env: featureFlags }));
vi.mock("../voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: voicePreview,
  // 这里注入的是本用例自己的假 adapter，不是 mock 模块，故无「模拟」标记。
  voicePreviewIsMock: false
}));
vi.mock("@tsz/voice-editor/editor", async () => {
  const actual = await vi.importActual<typeof import("@tsz/voice-editor/core")>(
    "@tsz/voice-editor/core"
  );
  return {
    ...actual,
    VoiceRichTextEditor: ({
      open,
      value,
      pronunciationHints,
      previewAdapter,
      onApply,
      onCancel
    }: VoiceRichTextEditorProps) =>
      open ? (
        <div
          role="dialog"
          aria-label="测试语音编辑器"
          data-pronunciation-hint={pronunciationHints?.centre}
          data-preview-enabled={String(Boolean(previewAdapter))}
        >
          <button
            type="button"
            onClick={() => onApply(actual.toRichTextV2(value))}
          >
            应用
          </button>
          <button type="button" onClick={onCancel}>
            取消
          </button>
        </div>
      ) : null
  };
});

vi.mock("./api", () => ({
  useSaveMeaningsStep: () => ({
    mutateAsync: mutations.save,
    isPending: false
  }),
  useSuggestDialectVariants: () => ({
    mutateAsync: mutations.suggest,
    isPending: false
  }),
  useCreateContentCompletionJob: () => ({
    mutateAsync: vi.fn(),
    isPending: false
  }),
  useContentCompletionJob: () => ({
    data: undefined,
    isError: false,
    refetch: vi.fn()
  }),
  useRetryContentCompletionJob: () => ({
    mutateAsync: vi.fn(),
    isPending: false
  })
}));

vi.mock("./ContentCompletionPanel", () => ({
  ContentCompletionPanel: () => <div data-testid="content-completion-panel" />
}));

vi.mock("../part-of-speech/api", async () => {
  const { partOfSpeechCatalogQueryResult } =
    await import("./partOfSpeech.test.helper");
  return { usePartOfSpeechCatalog: partOfSpeechCatalogQueryResult };
});

vi.mock("../api", () => ({
  useRelatedSearch: (query: string, open: boolean) => ({
    data: {
      results:
        open && query.trim()
          ? relatedWords.filter((word) =>
              word.headword.includes(query.trim().toLowerCase())
            )
          : []
    },
    isError: false,
    isFetching: false
  }),
  useRelatedSearchV2: (query: string, _kind: unknown, open: boolean) => {
    const exact = relatedWords.filter(
      (word) => word.headword === query.trim().toLowerCase()
    );
    const contains = relatedWords.filter(
      (word) =>
        word.headword.includes(query.trim().toLowerCase()) &&
        word.headword !== query.trim().toLowerCase()
    );
    const legacyMixed = relatedWords.filter((word) =>
      word.headword.includes(query.trim().toLowerCase())
    );
    const result = (
      results: Array<(typeof relatedWords)[number]>,
      isExact = false
    ) => ({
      data: open
        ? {
            pages: [
              relatedSearchV2State.missingPagination
                ? { results }
                : { results, total: results.length, next_cursor: null }
            ]
          }
        : undefined,
      isFetching: false,
      isError: isExact
        ? relatedSearchV2State.exactError
        : relatedSearchV2State.containsError,
      isFetchingNextPage: false,
      hasNextPage: isExact
        ? relatedSearchV2State.exactHasNextPage
        : relatedSearchV2State.containsHasNextPage,
      fetchNextPage: isExact
        ? relatedSearchV2State.fetchNextExactPage
        : relatedSearchV2State.fetchNextContainsPage,
      refetch: isExact
        ? relatedSearchV2State.refetchExact
        : relatedSearchV2State.refetchContains
    });
    return {
      exact: result(
        relatedSearchV2State.legacyMixedResults ? legacyMixed : exact,
        true
      ),
      contains: result(
        relatedSearchV2State.legacyMixedResults ? legacyMixed : contains
      )
    };
  }
}));

function button(label: string): HTMLButtonElement {
  // A whole-tree role query is extremely slow for this large AntD editor.
  const result = screen
    .getAllByText(label, { exact: true })
    .map((item) => item.closest("button"))
    .find((item): item is HTMLButtonElement => item !== null);
  if (!result) throw new Error(`button not found: ${label}`);
  return result as HTMLButtonElement;
}

function enabledButton(label: string): HTMLButtonElement {
  const result = screen
    .getAllByText(label, { exact: true })
    .map((item) => item.closest("button"))
    .find((item): item is HTMLButtonElement => item !== null && !item.disabled);
  if (!result) throw new Error(`enabled button not found: ${label}`);
  return result;
}

function selectMeaningDialect(label: "英式" | "美式") {
  fireEvent.click(
    within(screen.getByLabelText("词义内容方言")).getByText(label, {
      exact: true
    })
  );
}

async function selectInlineRelatedWord(
  relationTitle: "近义词" | "反义词" | "派生词",
  query: string,
  headword: string
) {
  const search = screen.getByLabelText(`${relationTitle}目标词条`);
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: query } });
  const options = await screen.findAllByText(headword, { exact: true });
  const option = options.find((item) =>
    item.closest(".ant-select-item-option")
  );
  if (!option)
    throw new Error(`inline related word option not found: ${headword}`);
  fireEvent.mouseDown(option);
  fireEvent.click(option);
}

async function selectContextTarget(
  search: HTMLElement,
  query: string,
  label: string
) {
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: query } });
  const options = await screen.findAllByText(label, { exact: true });
  const option = options.find((item) =>
    item.closest(".ant-select-item-option")
  );
  if (!option) throw new Error(`context target option not found: ${label}`);
  fireEvent.mouseDown(option);
  fireEvent.click(option);
}

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </span>
  );
}

function renderStep(
  word = wordFixture({ ready: true }),
  readOnly = false,
  issueTarget?: { nodeId: string; field?: string }
) {
  const onSaved = vi.fn();
  const onDraftChange = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/words/:wordId/wizard/meanings",
        element: (
          <>
            <MeaningsAndExamplesStep
              word={word}
              readOnly={readOnly}
              onSaved={onSaved}
              onDraftChange={onDraftChange}
            />
            <LocationProbe />
          </>
        )
      },
      {
        path: "/words/:wordId/wizard/:step",
        element: <LocationProbe />
      }
    ],
    {
      initialEntries: [
        {
          pathname: `/words/${word.id}/wizard/meanings`,
          state: issueTarget
        }
      ]
    }
  );
  const view = render(
    <AntApp>
      <RouterProvider router={router} />
    </AntApp>
  );
  return { onSaved, onDraftChange, router, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  featureFlags.VOICE_EDITOR = false;
  featureFlags.VOICE_PREVIEW = false;
  featureFlags.RELATED_SEARCH_V2 = false;
  featureFlags.WORD_CONTENT_COMPLETION = false;
  relatedSearchV2State.exactHasNextPage = false;
  relatedSearchV2State.containsHasNextPage = false;
  relatedSearchV2State.missingPagination = false;
  relatedSearchV2State.legacyMixedResults = false;
  relatedSearchV2State.exactError = false;
  relatedSearchV2State.containsError = false;
  voicePreview.listVoices.mockResolvedValue([
    {
      id: "en-GB-Sonia",
      label: "Sonia · en-GB",
      locale: "en-GB",
      gender: "female",
      styles: [],
      supportsRate: true,
      supportsPitch: true,
      isDefault: true,
      rateRange: { min: -50, max: 100 },
      pitchRange: { min: -12, max: 12 }
    }
  ]);
  voicePreview.synthesize.mockReturnValue(new Promise(() => undefined));
  dataSourceCapabilities.dialectVariantSuggestions = true;
  mutations.save.mockResolvedValue({
    word: wordFixture({ ready: true, revision: 4 })
  });
  vi.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(() => vi.restoreAllMocks());

describe("MeaningsAndExamplesStep", () => {
  it("默认关闭词条内容自动生成与回填入口", () => {
    renderStep();

    expect(screen.queryByTestId("content-completion-panel")).toBeNull();
  });

  it("仅在显式开启开关时挂载词条内容自动生成面板", () => {
    featureFlags.WORD_CONTENT_COMPLETION = true;

    renderStep();

    expect(screen.getByTestId("content-completion-panel")).toBeInTheDocument();
  });

  it("向上游持续提供当前未保存草稿用于实时完成度", async () => {
    const { onDraftChange } = renderStep(wordFixture({ ready: true }));
    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
    onDraftChange.mockClear();

    fireEvent.change(screen.getByLabelText("中文释义"), {
      target: { value: "更新后的释义" }
    });

    await waitFor(() => {
      const latest = onDraftChange.mock.lastCall?.[0] as
        DraftMeaningsStepContent | undefined;
      const definition = latest?.pos[0]?.senses[0]?.definitions[0];
      expect(
        definition && "text" in definition.content
          ? definition.content.text
          : undefined
      ).toBe("更新后的释义");
    });
  });

  it("从词形读音构造 IPA 提示，优先词典音标且不覆盖首个同名词形", () => {
    const forms = structuredClone(wordFixture().forms);
    const sample = forms.pos[0]!.base_form.variants[0]!;
    forms.pos = [
      {
        ...forms.pos[0]!,
        form_groups: [],
        base_form: {
          ...forms.pos[0]!.base_form,
          variants: [
            {
              ...sample,
              id: "actual",
              spelling: " Word ",
              pronunciations: [
                {
                  ...sample.pronunciations[0]!,
                  id: "actual-pronunciation",
                  dict_phonetic: "",
                  actual_pron: "actual"
                }
              ]
            },
            {
              ...sample,
              id: "duplicate",
              spelling: "word",
              pronunciations: [
                {
                  ...sample.pronunciations[0]!,
                  id: "duplicate-pronunciation",
                  dict_phonetic: "dictionary",
                  actual_pron: "duplicate"
                }
              ]
            },
            {
              ...sample,
              id: "known",
              spelling: "known",
              pronunciations: [
                {
                  ...sample.pronunciations[0]!,
                  id: "known-pronunciation",
                  dict_phonetic: "known-dictionary",
                  actual_pron: "known-actual"
                }
              ]
            },
            {
              ...sample,
              id: "silent",
              spelling: "silent",
              pronunciations: [
                {
                  ...sample.pronunciations[0]!,
                  id: "silent-pronunciation",
                  dict_phonetic: "",
                  actual_pron: ""
                }
              ]
            },
            { ...sample, id: "empty", spelling: "", pronunciations: [] }
          ]
        }
      }
    ];

    expect(collectPronunciationHints(forms)).toEqual({
      word: "actual",
      known: "known-dictionary"
    });
  });

  it("默认展示必填语义区间，并锁定最后一项删除入口", () => {
    const word = wordFixture();
    renderStep(word);
    const firstSenseLevel =
      word.meanings.pos[0]!.senses[0]!.level.toLowerCase();

    expect(
      document.querySelector(`.word-sense-editor-${firstSenseLevel}`)
    ).toBeInTheDocument();
    expect(
      screen.queryByText("每个词义必须选择一个语义区间，至少保留 1 个")
    ).toBeNull();
    expect(screen.queryByText("必填")).toBeNull();
    expect(screen.getByLabelText("第 1 个语义区间")).toHaveTextContent("1");
    expect(screen.getByLabelText("第 1 个语法结构")).toHaveTextContent("1");
    expect(screen.queryByText("结构 1")).toBeNull();
    expect(screen.queryByText("英美文本独立维护")).toBeNull();
    expect(screen.getAllByText("英式").length).toBeGreaterThan(0);
    expect(screen.getAllByText("美式").length).toBeGreaterThan(0);
    expect(screen.queryByText("英式英语")).toBeNull();
    expect(screen.queryByText("美式英语")).toBeNull();
    expect(screen.getByLabelText("英式语法结构 1 播放语音")).toBeDisabled();
    expect(screen.getByLabelText("英式语法结构 1 获取语音")).toBeDisabled();
    expect(screen.queryByLabelText("英式语法结构 1 上传语音")).toBeNull();
    expect(screen.getByLabelText("美式语法结构 1 获取语音")).toBeDisabled();
    expect(screen.queryByLabelText("美式语法结构 1 上传语音")).toBeNull();
    expect(screen.getByLabelText("拖动语法结构 1")).toBeDisabled();
    expect(screen.queryByLabelText("上移语法结构 1")).toBeNull();
    expect(screen.queryByLabelText("下移语法结构 1")).toBeNull();
    expect(screen.getByLabelText("语义区间 1 中文")).toHaveValue("");
    expect(screen.getByLabelText("语义区间 1 英文")).toHaveValue("");
    expect(screen.getByLabelText("删除语义区间 1")).toBeDisabled();
    expect(
      screen.getAllByText("待填写中文名 / 待填写英文名").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("语义区间")[0]).toHaveAttribute(
      "aria-required",
      "true"
    );
  });

  it("绑定语法结构的选项和已选值直接展示当前方言内容", async () => {
    const word = wordFixture({ ready: true });
    const meanings = word.meanings.pos[0]!;
    meanings.senses[0]!.definitions[0]!.grammar_structure_id =
      meanings.grammar_structures[0]!.id;
    renderStep(word);
    const binding = screen.getAllByLabelText("绑定语法结构")[0]!;

    expect(
      within(binding.closest(".ant-select") as HTMLElement).getByText(
        "the center"
      )
    ).toBeInTheDocument();
    fireEvent.mouseDown(binding);
    expect(
      await screen.findByRole("option", { name: "the center" })
    ).toBeInTheDocument();

    selectMeaningDialect("英式");
    const britishBinding = screen.getAllByLabelText("绑定语法结构")[0]!;
    expect(
      within(britishBinding.closest(".ant-select") as HTMLElement).getByText(
        "a centre"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("语法结构 1", { exact: true })).toBeNull();
  });

  it("词义头部同步当前方言输入，并在编辑后保留文本节点 ID", async () => {
    const word = wordFixture({ ready: true });
    if (word.headwords.mode !== "distinguish") {
      throw new Error("fixture should distinguish English dialects");
    }
    word.headwords.source_dialect = "us";
    const firstDefinition = word.meanings.pos[0]!.senses[0]!.definitions[0]!;
    const richText = (text: string): RichText => ({
      version: 1,
      text,
      spans: [],
      liaisons: []
    });
    firstDefinition.definition_mode = "en_definition";
    firstDefinition.content = {
      mode: "distinguish",
      source_dialect: "us",
      uk: {
        state: "ready",
        variant: {
          id: "first-definition-uk",
          value: richText("British first"),
          origin: "manual"
        }
      },
      us: {
        state: "ready",
        variant: {
          id: "first-definition-us",
          value: richText("American first"),
          origin: "manual"
        }
      }
    } satisfies EnglishTextV2;
    renderStep(word);

    expect(
      screen.getByText("1. American first", { exact: true })
    ).toBeVisible();
    fireEvent.change(screen.getAllByLabelText("美式英语文本")[0]!, {
      target: { value: "American changed" }
    });
    expect(
      screen.getByText("1. American changed", { exact: true })
    ).toBeVisible();

    selectMeaningDialect("英式");
    expect(screen.getByText("1. British first", { exact: true })).toBeVisible();
    fireEvent.change(screen.getAllByLabelText("英式英语文本")[0]!, {
      target: { value: "British changed" }
    });
    expect(
      screen.getByText("1. British changed", { exact: true })
    ).toBeVisible();

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedDefinition =
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].definitions[0];
    expect(savedDefinition.content).toMatchObject({
      mode: "distinguish",
      uk: { state: "ready", variant: { id: "first-definition-uk" } },
      us: { state: "ready", variant: { id: "first-definition-us" } }
    });
  });

  it("语法结构方言输入使用真实试听且不暴露无契约的上传操作", async () => {
    featureFlags.VOICE_PREVIEW = true;
    const word = wordFixture({ ready: true });
    word.meanings.pos[0]!.grammar_structures[0]!.variants[0]!.content.text =
      "a record";
    renderStep(word);

    const generate = screen.getByLabelText("英式语法结构 1 获取语音");
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);

    await waitFor(() =>
      expect(voicePreview.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          language: "en",
          content: expect.objectContaining({ text: "a record" }),
          voiceId: "en-GB-Sonia"
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );
    expect(screen.queryByLabelText("英式语法结构 1 上传语音")).toBeNull();
    expect(screen.queryByText(/Mock/)).toBeNull();
  });

  it("语法结构拖动手柄支持上下方向键排序", () => {
    const word = wordFixture({ ready: true });
    const grammars = word.meanings.pos[0]!.grammar_structures;
    grammars[0]!.variants.forEach((variant) => {
      variant.content.text = "first grammar";
    });
    const secondGrammar = createGrammar(word.headwords);
    secondGrammar.variants.forEach((variant) => {
      variant.content.text = "second grammar";
    });
    grammars.push(secondGrammar);
    renderStep(word);

    fireEvent.keyDown(screen.getByLabelText("拖动语法结构 2"), {
      key: "ArrowUp"
    });
    expect(screen.getByLabelText("英式语法结构 1")).toHaveValue(
      "second grammar"
    );

    fireEvent.keyDown(screen.getByLabelText("拖动语法结构 1"), {
      key: "ArrowDown"
    });
    expect(screen.getByLabelText("英式语法结构 2")).toHaveValue(
      "second grammar"
    );
    fireEvent.keyDown(screen.getByLabelText("拖动语法结构 1"), {
      key: "Enter"
    });
  });

  it("语法结构排序忽略外部、缺失和无效的拖放数据", () => {
    const word = wordFixture({ ready: true });
    word.meanings.pos[0]!.grammar_structures.push(
      createGrammar(word.headwords)
    );
    renderStep(word);
    const target = screen
      .getByLabelText("拖动语法结构 1")
      .closest(".word-grammar-row")!;

    const dataTransfer = (raw: string, types: string[]) => ({
      effectAllowed: "none",
      dropEffect: "none",
      types,
      setData: vi.fn(),
      getData: () => raw
    });
    const grammarType = "application/x-tsz-grammar-structure";

    fireEvent.dragOver(target, {
      dataTransfer: dataTransfer("", ["text/plain"])
    });
    fireEvent.drop(target, {
      dataTransfer: dataTransfer("", [grammarType])
    });
    fireEvent.drop(target, {
      dataTransfer: dataTransfer("not-json", [grammarType])
    });
    fireEvent.drop(target, {
      dataTransfer: dataTransfer(
        JSON.stringify({ posId: "other-pos", index: 1 }),
        [grammarType]
      )
    });
    fireEvent.drop(target, {
      dataTransfer: dataTransfer(
        JSON.stringify({ posId: word.meanings.pos[0]!.pos_id, index: "1" }),
        [grammarType]
      )
    });
    fireEvent.drop(target, {
      dataTransfer: dataTransfer(
        JSON.stringify({ posId: word.meanings.pos[0]!.pos_id, index: 0 }),
        [grammarType]
      )
    });
    fireEvent.dragOver(target, {
      dataTransfer: dataTransfer("", [grammarType])
    });
    fireEvent.dragLeave(target);

    expect(screen.getByLabelText("英式语法结构 1")).toBeInTheDocument();
    expect(screen.getByLabelText("英式语法结构 2")).toBeInTheDocument();
  });

  it("多维释义和多维例句使用拖动手柄排序", () => {
    const word = wordFixture({ ready: true });
    const sense = word.meanings.pos[0]!.senses[0]!;
    const firstDefinition = sense.definitions[0]!;
    firstDefinition.definition_mode = "zh_definition";
    firstDefinition.content = {
      version: 1,
      text: "first definition",
      spans: [],
      liaisons: []
    } satisfies RichText;
    sense.definitions = [
      firstDefinition,
      {
        ...structuredClone(firstDefinition),
        id: "definition-drag-second",
        definition_mode: "zh_definition" as const,
        content_id:
          "content_id" in firstDefinition
            ? `${firstDefinition.content_id}-second`
            : "definition-drag-second-content",
        content: {
          version: 1,
          text: "second definition",
          spans: [],
          liaisons: []
        }
      }
    ];
    const firstSentence = sense.sentences[0]!;
    firstSentence.zh_text.text = "first sentence";
    sense.sentences = [
      firstSentence,
      {
        ...structuredClone(firstSentence),
        id: "sentence-drag-second",
        zh_text: { ...firstSentence.zh_text, text: "second sentence" }
      }
    ];
    renderStep(word);

    const dragUp = (sourceLabel: string, targetLabel: string, type: string) => {
      const source = screen.getByLabelText(sourceLabel);
      const target = screen
        .getByLabelText(targetLabel)
        .closest(".word-table-row")!;
      const store = new Map<string, string>();
      const dataTransfer = {
        effectAllowed: "none",
        dropEffect: "none",
        types: [type],
        setData: (dataType: string, data: string) => store.set(dataType, data),
        getData: (dataType: string) => store.get(dataType) ?? ""
      };
      fireEvent.dragStart(source, { dataTransfer });
      fireEvent.dragOver(target, { dataTransfer });
      fireEvent.drop(target, { dataTransfer });
      fireEvent.dragEnd(source, { dataTransfer });
    };

    dragUp("拖动释义 2", "拖动释义 1", "application/x-tsz-definition");
    expect(screen.getAllByLabelText("中文释义")[0]).toHaveValue(
      "second definition"
    );

    dragUp("拖动例句 2", "拖动例句 1", "application/x-tsz-sentence");
    expect(screen.getAllByLabelText("汉语译文")[0]).toHaveValue(
      "second sentence"
    );

    fireEvent.keyDown(screen.getByLabelText("拖动例句 1"), {
      key: "ArrowDown"
    });
    expect(screen.getAllByLabelText("汉语译文")[1]).toHaveValue(
      "second sentence"
    );
  });

  it("词义显示细分词性选择器，并只列出所属基本词性的细分项", async () => {
    const word = wordFixture({ ready: true });
    renderStep(word);

    const selectors = screen.getAllByLabelText("细分词性");
    expect(selectors.length).toBeGreaterThan(0);
    fireEvent.mouseDown(selectors[0]!);
    expect(
      (await screen.findAllByText("可数名词", { exact: true })).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("及物动词", { exact: true })).toBeNull();
  });

  it("编辑后完成保存并放行到 preview，提交 revision 与干净 content", async () => {
    const word = wordFixture({ ready: true });
    const originalContentId = word.meanings.pos[0]!.senses[0]!.definitions[0]!;
    const saved = wordFixture({
      ready: true,
      revision: 4,
      max_reachable_step: "preview"
    });
    mutations.save.mockResolvedValue({ word: saved });
    const { onSaved, router } = renderStep(word);
    const definition = screen.getAllByLabelText("中文释义")[0]!;

    fireEvent.change(definition, { target: { value: "用户修改后的中文释义" } });
    fireEvent.click(button("完成并进入预览"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        base_revision: word.revision,
        intent: "complete",
        content: expect.objectContaining({
          sense_groups: expect.any(Array),
          pos: expect.any(Array)
        })
      })
    );
    const payload = mutations.save.mock.calls[0]![0];
    expect(payload).not.toHaveProperty("operation_id");
    expect(payload.content.pos[0].senses[0].definitions[0].content.text).toBe(
      "用户修改后的中文释义"
    );
    expect(payload.content.pos[0].senses[0].definitions[0].content_id).toBe(
      "content_id" in originalContentId
        ? originalContentId.content_id
        : undefined
    );
    expect(onSaved).toHaveBeenCalledWith(saved);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/words/${word.id}/wizard/preview`
      )
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("语义区间分别录入并恢复中英文名，下拉展示双语名称", async () => {
    const word = wordFixture({ ready: true });
    word.meanings.sense_groups = [
      { id: "group-space", name_zh: "空间", name_en: "Space" }
    ];
    word.meanings.pos[0]!.senses[0]!.sense_group_id = "group-space";
    renderStep(word);

    expect(screen.getByLabelText("语义区间 1 中文")).toHaveValue("空间");
    expect(screen.getByLabelText("语义区间 1 英文")).toHaveValue("Space");
    expect(
      screen.getByText("空间 / Space", { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(enabledButton("添加语义区间"));
    const nameZhInputs = screen.getAllByLabelText(/^语义区间 \d+ 中文$/);
    const nameEnInputs = screen.getAllByLabelText(/^语义区间 \d+ 英文$/);
    fireEvent.change(nameZhInputs.at(-1)!, {
      target: { value: "几何与物理空间核心" }
    });
    fireEvent.change(nameEnInputs.at(-1)!, {
      target: { value: "Core geometric and physical space" }
    });

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save.mock.calls[0]![0].content.sense_groups).toEqual([
      { id: "group-space", name_zh: "空间", name_en: "Space" },
      expect.objectContaining({
        id: expect.any(String),
        name_zh: "几何与物理空间核心",
        name_en: "Core geometric and physical space"
      })
    ]);
  });

  it("删除被词义引用的双语语义区间时，经确认改绑到剩余区间并保留词义", async () => {
    const word = wordFixture({ ready: true });
    word.meanings.sense_groups = [
      { id: "group-shared", name_zh: "共同空间", name_en: "Shared space" },
      { id: "group-default", name_zh: "常规含义", name_en: "General meaning" }
    ];
    for (const pos of word.meanings.pos) {
      pos.senses[0]!.sense_group_id = "group-shared";
    }
    const initialSenseIds = word.meanings.pos.map((pos) => pos.senses[0]!.id);
    renderStep(word);

    fireEvent.click(screen.getByLabelText("删除语义区间 1"));
    expect(
      (
        await screen.findAllByText("删除被词义引用的语义区间？", {
          exact: true
        })
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "将把 2 个词义改绑到“常规含义 / General meaning”，词义内容本身会保留。"
      )
    ).toBeInTheDocument();
    fireEvent.click(button("删除并改绑"));

    await waitFor(() =>
      expect(screen.getByLabelText("语义区间 1 中文")).toHaveValue("常规含义")
    );
    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const content = mutations.save.mock.calls[0]![0]
      .content as DraftMeaningsStepContent;
    expect(content.sense_groups).toEqual([
      { id: "group-default", name_zh: "常规含义", name_en: "General meaning" }
    ]);
    expect(content.pos.map((pos) => pos.senses[0]!.id)).toEqual(
      initialSenseIds
    );
    expect(
      content.pos.every(
        (pos) => pos.senses[0]!.sense_group_id === "group-default"
      )
    ).toBe(true);
  });

  it("删除被释义引用的语法结构时，经确认只清空对应绑定", async () => {
    const word = wordFixture({ ready: true });
    const meanings = word.meanings.pos[0]!;
    const firstGrammar = meanings.grammar_structures[0]!;
    const secondGrammar = createGrammar(word.headwords);
    meanings.grammar_structures.push(secondGrammar);
    const firstDefinition = meanings.senses[0]!.definitions[0]!;
    firstDefinition.grammar_structure_id = firstGrammar.id;
    meanings.senses[0]!.definitions.push({
      ...structuredClone(firstDefinition),
      id: "definition-kept-binding",
      grammar_structure_id: secondGrammar.id
    });
    renderStep(word);

    fireEvent.click(screen.getByLabelText("删除语法结构 1"));
    expect(
      (
        await screen.findAllByText("删除被释义引用的语法结构？", {
          exact: true
        })
      ).length
    ).toBeGreaterThan(0);
    fireEvent.click(button("删除并清空引用"));
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedMeanings = (
      mutations.save.mock.calls[0]![0].content as DraftMeaningsStepContent
    ).pos[0]!;
    expect(
      savedMeanings.grammar_structures.map((grammar) => grammar.id)
    ).toEqual([secondGrammar.id]);
    expect(
      savedMeanings.senses[0]!.definitions.find(
        (definition) => definition.id === firstDefinition.id
      )!.grammar_structure_id
    ).toBeUndefined();
    expect(
      savedMeanings.senses[0]!.definitions.find(
        (definition) => definition.id === "definition-kept-binding"
      )!.grammar_structure_id
    ).toBe(secondGrammar.id);
  });

  it("删除被上下文和关系词引用的词义时一并清理跨词性引用", async () => {
    const word = wordFixture({ ready: true });
    const removedSense = word.meanings.pos[0]!.senses[0]!;
    const referencingSense = word.meanings.pos[1]!.senses[0]!;
    referencingSense.sentences[0]!.links.push({
      word_id: word.id,
      sense_id: removedSense.id,
      role: "context"
    });
    referencingSense.relations.push({
      id: "relation-to-removed-sense",
      relation: "synonym",
      target_word_id: word.id,
      target_sense_id: removedSense.id,
      score: "50"
    });
    renderStep(word);

    fireEvent.click(screen.getByLabelText("管理词义 1"));
    fireEvent.click(await screen.findByText("删除词义", { exact: true }));
    expect(
      screen.getAllByText(
        "该词义还被 2 条上下文关联或关系词引用；确认后会一并清理这些引用。"
      ).length
    ).toBeGreaterThan(0);
    fireEvent.click(button("删除并清理引用"));
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const saved = mutations.save.mock.calls[0]![0].content;
    expect(saved.pos[0].senses).toEqual([]);
    expect(saved.pos[1].senses[0].sentences[0].links).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sense_id: removedSense.id })
      ])
    );
    expect(saved.pos[1].senses[0].relations).toEqual([]);
  });

  it("保存失败保留用户编辑值并停留当前步骤", async () => {
    mutations.save.mockRejectedValue(new Error("meanings save failed"));
    const { router } = renderStep();
    const definition = screen.getAllByLabelText("中文释义")[0]!;
    fireEvent.change(definition, { target: { value: "失败后仍应保留" } });

    fireEvent.click(button("保存草稿"));

    expect(await screen.findByText("meanings save failed")).toBeInTheDocument();
    expect(definition).toHaveValue("失败后仍应保留");
    expect(router.state.location.pathname).toBe(
      "/words/word-center/wizard/meanings"
    );
  });

  it("保存抛出非 Error 值时显示稳定兜底提示", async () => {
    mutations.save.mockRejectedValue(null);
    renderStep();

    fireEvent.click(button("保存草稿"));

    expect(await screen.findByText("保存失败")).toBeInTheDocument();
  });

  it("保存请求在途时锁定编辑区", async () => {
    const pending = deferred<{ word: ReturnType<typeof wordFixture> }>();
    mutations.save.mockReturnValue(pending.promise);
    const saved = wordFixture({ ready: true, revision: 4 });
    const { onSaved } = renderStep();
    const definition = screen.getAllByLabelText("中文释义")[0]!;
    fireEvent.change(definition, { target: { value: "before-request" } });

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(definition).toBeDisabled());

    await act(async () => pending.resolve({ word: saved }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  it("已选关联词可在行内搜索已发布词条并重新选择具体词义", async () => {
    const word = wordFixture({ ready: true });
    word.meanings.pos[0]!.senses[0]!.relations.push({
      id: "relation-selected",
      relation: "synonym",
      target_word_id: "fixture-colour",
      target_sense_id: "fixture-colour-sense",
      target_headword: "colour",
      target_gloss: "颜色",
      score: "90"
    });
    renderStep(word);
    const targetWord = screen.getByLabelText("近义词目标词条");
    const relationRow = targetWord.closest(".word-relation-row") as HTMLElement;
    expect(targetWord).toHaveValue("colour");
    expect(within(relationRow).getByText("颜色")).toBeInTheDocument();
    expect(targetWord).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("dialog")).toBeNull();

    await selectInlineRelatedWord("近义词", "far", "far");
    expect(within(relationRow).getByText("选择词义")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText("近义词目标词义"));
    fireEvent.click(await screen.findByText("远的", { exact: true }));
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const relation =
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].relations[0];
    expect(relation).toEqual({
      id: "relation-selected",
      relation: "synonym",
      target_word_id: "fixture-far",
      target_sense_id: "fixture-far-sense",
      score: "90"
    });
  });

  it("V2 搜索保留两个同名目标并保存明确选择的第二个 word_id+sense_id", async () => {
    featureFlags.RELATED_SEARCH_V2 = true;
    renderStep(wordFixture({ ready: true }));
    fireEvent.click(enabledButton("添加近义词"));
    const search = screen.getByLabelText("近义词目标词条");
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "workspace" } });

    expect(
      (await screen.findAllByText("完全同名", { exact: true })).length
    ).toBe(2);
    const firstId = await screen.findByText("word · 11111111", { exact: true });
    const secondId = await screen.findByText("word · 22222222", {
      exact: true
    });
    expect(firstId).toBeInTheDocument();
    const secondOption = secondId.closest(".ant-select-item-option");
    if (!secondOption) throw new Error("second workspace option not found");
    fireEvent.mouseDown(secondOption);
    fireEvent.click(secondOption);

    fireEvent.mouseDown(screen.getByLabelText("近义词目标词义"));
    fireEvent.click(await screen.findByText("工作区乙二", { exact: true }));
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const relations =
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].relations;
    expect(relations.at(-1)).toMatchObject({
      target_word_id: "22222222-workspace-second",
      target_sense_id: "workspace-second-sense-2"
    });
  });

  it("V2 缺少分页字段时明确提示未取全，并允许加载 exact 下一页", async () => {
    featureFlags.RELATED_SEARCH_V2 = true;
    relatedSearchV2State.exactHasNextPage = true;
    relatedSearchV2State.missingPagination = true;
    relatedSearchV2State.legacyMixedResults = true;
    renderStep(wordFixture({ ready: true }));
    fireEvent.click(enabledButton("添加近义词"));
    const search = screen.getByLabelText("近义词目标词条");
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "work" } });

    expect(
      await screen.findByText("后端未返回完整分页信息，不能确认已取全同名词条")
    ).toBeInTheDocument();
    expect(screen.queryByText("完全同名")).not.toBeInTheDocument();
    expect(screen.queryByText("相关联想")).not.toBeInTheDocument();
    fireEvent.click(button("加载更多同名词条"));
    expect(relatedSearchV2State.fetchNextExactPage).toHaveBeenCalledTimes(1);
  });

  it("V2 contains 有下一页时允许继续加载相关联想", async () => {
    featureFlags.RELATED_SEARCH_V2 = true;
    relatedSearchV2State.containsHasNextPage = true;
    renderStep(wordFixture({ ready: true }));
    fireEvent.click(enabledButton("添加近义词"));
    const search = screen.getByLabelText("近义词目标词条");
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "work" } });

    fireEvent.click(await screen.findByText("加载更多相关联想"));
    expect(relatedSearchV2State.fetchNextContainsPage).toHaveBeenCalledTimes(1);
    expect(relatedSearchV2State.fetchNextExactPage).not.toHaveBeenCalled();
  });

  it("V2 exact 失败时不冒充无结果，并允许重试同名词条搜索", async () => {
    featureFlags.RELATED_SEARCH_V2 = true;
    relatedSearchV2State.exactError = true;
    renderStep(wordFixture({ ready: true }));
    fireEvent.click(enabledButton("添加近义词"));
    const search = screen.getByLabelText("近义词目标词条");
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "workspace" } });

    expect(
      await screen.findByText("完全同名词条搜索失败，结果可能不完整")
    ).toBeInTheDocument();
    expect(screen.queryByText("未找到匹配词条")).not.toBeInTheDocument();
    fireEvent.click(button("重 试"));
    expect(relatedSearchV2State.refetchExact).toHaveBeenCalledTimes(1);
  });

  it("V2 contains 失败时不冒充无结果，并允许重试相关联想", async () => {
    featureFlags.RELATED_SEARCH_V2 = true;
    relatedSearchV2State.containsError = true;
    renderStep(wordFixture({ ready: true }));
    fireEvent.click(enabledButton("添加近义词"));
    const search = screen.getByLabelText("近义词目标词条");
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "workspace" } });

    expect(
      await screen.findByText("相关联想搜索失败，结果可能不完整")
    ).toBeInTheDocument();
    expect(screen.queryByText("未找到匹配词条")).not.toBeInTheDocument();
    const alert = screen
      .getByText("相关联想搜索失败，结果可能不完整")
      .closest(".ant-alert");
    fireEvent.click(within(alert as HTMLElement).getByText("重 试"));
    expect(relatedSearchV2State.refetchContains).toHaveBeenCalledTimes(1);
  });

  it("完成前执行客户端完整性校验，不向后端提交不完整 meanings", async () => {
    renderStep(wordFixture());

    fireEvent.click(button("完成并进入预览"));

    expect(
      await screen.findByText("请填写语义区间 1 的中文名")
    ).toBeInTheDocument();
    expect(mutations.save).not.toHaveBeenCalled();
  });

  it("新增词义后保存，payload 保留新节点和唯一 focus 关联", async () => {
    const word = wordFixture({ ready: true });
    const initialCount = word.meanings.pos[0]!.senses.length;
    renderStep(word);

    fireEvent.click(button("添加词义"));
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const senses = mutations.save.mock.calls[0]![0].content.pos[0].senses;
    expect(senses).toHaveLength(initialCount + 1);
    const added = senses.at(-1)!;
    expect(added.id).toEqual(expect.any(String));
    expect(added.sense_group_id).toBe(word.meanings.sense_groups[0]!.id);
    expect(added.sentences[0].links).toEqual([
      { word_id: word.id, sense_id: added.id, role: "focus" }
    ]);
  });

  it("上下文关联只能选择具体词义，并以完整 word_id 与 sense_id 保存", async () => {
    renderStep(wordFixture({ ready: true }));

    await selectContextTarget(
      screen.getAllByLabelText("搜索并添加上下文关联")[0]!,
      "colour",
      "colour · 颜色"
    );

    expect(screen.getAllByLabelText("上下文词条 ID")[0]).toHaveValue(
      "fixture-colour"
    );
    expect(screen.getAllByLabelText("上下文词义 ID")[0]).toHaveValue(
      "fixture-colour-sense"
    );

    await selectContextTarget(
      screen.getAllByLabelText("搜索并添加上下文关联")[0]!,
      "colour",
      "colour · 颜色"
    );
    expect(screen.getAllByLabelText("上下文词条 ID")).toHaveLength(1);

    await selectContextTarget(
      screen.getAllByLabelText("搜索并添加上下文关联")[0]!,
      "blank",
      "blank · （无释义）"
    );
    expect(screen.getAllByLabelText("上下文词条 ID")).toHaveLength(2);

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const links =
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].sentences[0]
        .links;
    expect(links).toContainEqual({
      word_id: "fixture-colour",
      sense_id: "fixture-colour-sense",
      role: "context"
    });
    expect(links).toContainEqual({
      word_id: "fixture-blank",
      sense_id: "fixture-blank-sense",
      role: "context"
    });
    expect(links).not.toContainEqual(
      expect.objectContaining({ word_id: "", role: "context" })
    );
    expect(links).not.toContainEqual(
      expect.objectContaining({ sense_id: "", role: "context" })
    );
  });

  it("T60 全局选择默认跟随源方言，只切换展示且完整目标不发请求", () => {
    renderStep(wordFixture({ ready: true }));

    const dialectControl = screen.getByLabelText("词义内容方言");
    const toolbar = dialectControl.closest(".word-meaning-dialect-toolbar")!;
    const senseGroups = document.querySelector(".word-sense-groups-card")!;
    expect(
      toolbar.compareDocumentPosition(senseGroups) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getAllByLabelText("美式英语文本").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("英式英语文本")).toHaveLength(0);

    selectMeaningDialect("英式");

    expect(screen.getAllByLabelText("英式英语文本").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("美式英语文本")).toHaveLength(0);
    expect(mutations.suggest).not.toHaveBeenCalled();
    expect(screen.getByLabelText("英式语法结构 1")).toBeInTheDocument();
    expect(screen.getByLabelText("美式语法结构 1")).toBeInTheDocument();
  });

  it("T60 统一拼写不展示选择器；只读状态可切换既有内容但不自动补全", () => {
    const unifiedView = renderStep(
      wordFixture({ headword: "far", ready: true })
    );
    expect(screen.queryByLabelText("词义内容方言")).toBeNull();
    unifiedView.unmount();
    unifiedView.router.dispose();

    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    sentence.en_text.uk = { state: "missing" };
    renderStep(word, true);

    selectMeaningDialect("英式");
    expect(screen.getAllByLabelText("英式英语文本").length).toBeGreaterThan(0);
    expect(mutations.suggest).not.toHaveBeenCalled();
  });

  it("T61 切换到缺失方言时跨释义和例句只发一次批量请求，语法结构不参与", async () => {
    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    sentence.en_text.uk = { state: "missing" };
    word.meanings.pos[0]!.senses[0]!.definitions.push({
      id: "english-definition",
      level: "A1",
      definition_mode: "en_definition",
      content: {
        mode: "distinguish",
        source_dialect: "us",
        uk: { state: "missing" },
        us: {
          state: "ready",
          variant: {
            id: "english-definition-us",
            origin: "manual",
            value: {
              version: 1,
              text: "the center",
              spans: [],
              liaisons: []
            }
          }
        }
      }
    });
    mutations.suggest.mockResolvedValue({
      suggestions: [
        {
          client_id: sentence.id,
          field_kind: "example",
          value: {
            version: 1,
            text: "The generated British example.",
            spans: [],
            liaisons: []
          },
          model_version: "mock-v1"
        },
        {
          client_id: "english-definition",
          field_kind: "definition",
          value: {
            version: 1,
            text: "the centre",
            spans: [],
            liaisons: []
          },
          model_version: "mock-v1"
        }
      ]
    });
    renderStep(word);

    selectMeaningDialect("英式");

    await waitFor(() => expect(mutations.suggest).toHaveBeenCalledTimes(1));
    expect(mutations.suggest).toHaveBeenCalledWith({
      source_dialect: "us",
      target_dialect: "uk",
      items: expect.arrayContaining([
        expect.objectContaining({
          client_id: sentence.id,
          field_kind: "example"
        }),
        expect.objectContaining({
          client_id: "english-definition",
          field_kind: "definition"
        })
      ])
    });
    expect(mutations.suggest.mock.calls[0]![0].items).toHaveLength(2);
    await waitFor(() =>
      expect(
        screen
          .getAllByLabelText("英式英语文本")
          .some(
            (input) =>
              (input as HTMLTextAreaElement).value ===
              "The generated British example."
          )
      ).toBe(true)
    );
    expect(
      screen
        .getAllByLabelText("英式英语文本")
        .some((input) => (input as HTMLTextAreaElement).value === "the centre")
    ).toBe(true);
    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].sentences[0]
        .en_text.uk
    ).toMatchObject({
      state: "ready",
      variant: { origin: "converted" }
    });
  });

  it("T62 部分返回后保留缺失项并可一键重试", async () => {
    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    sentence.en_text.uk = { state: "missing" };
    const secondSentence = structuredClone(sentence);
    secondSentence.id = "second-example";
    if (secondSentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    secondSentence.en_text.uk = { state: "missing" };
    word.meanings.pos[0]!.senses[0]!.sentences.push(secondSentence);
    mutations.suggest.mockResolvedValueOnce({
      suggestions: [
        {
          client_id: sentence.id,
          field_kind: "example",
          value: {
            version: 1,
            text: "The first British example.",
            spans: [],
            liaisons: []
          },
          model_version: "mock-v1"
        }
      ]
    });
    mutations.suggest.mockResolvedValueOnce({
      suggestions: [
        {
          client_id: secondSentence.id,
          field_kind: "example",
          value: {
            version: 1,
            text: "The second British example.",
            spans: [],
            liaisons: []
          },
          model_version: "mock-v1"
        }
      ]
    });
    renderStep(word);

    selectMeaningDialect("英式");
    await waitFor(() => expect(mutations.suggest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button("重试补全 1 项")).toBeEnabled());
    fireEvent.click(button("重试补全 1 项"));
    await waitFor(() => expect(mutations.suggest).toHaveBeenCalledTimes(2));
    expect(mutations.suggest.mock.calls[1]![0].items).toHaveLength(1);
    expect(mutations.suggest.mock.calls[1]![0].items[0].client_id).toBe(
      secondSentence.id
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByLabelText("英式英语文本")
          .some(
            (input) =>
              (input as HTMLTextAreaElement).value ===
              "The second British example."
          )
      ).toBe(true)
    );
  });

  it("101 项分批补全全部结束前禁用保存，完成后保存全部批次结果", async () => {
    const word = wordFixture({ ready: true });
    const original = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (original.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    original.en_text.uk = { state: "missing" };
    const firstBatch = deferred<void>();
    const secondBatch = deferred<void>();
    const realRunner = meaningDialectSuggestionBatchRunner.run;
    vi.spyOn(meaningDialectSuggestionBatchRunner, "run").mockImplementation(
      async (request, _send, apply) => {
        await firstBatch.promise;
        apply([
          {
            client_id: request.items[0]!.client_id,
            field_kind: "example",
            value: {
              version: 1,
              text: "British first batch",
              spans: [],
              liaisons: []
            }
          }
        ]);
        await secondBatch.promise;
      }
    );
    renderStep(word);

    selectMeaningDialect("英式");
    await waitFor(() =>
      expect(meaningDialectSuggestionBatchRunner.run).toHaveBeenCalledTimes(1)
    );
    expect(button("保存草稿")).toBeDisabled();
    fireEvent.click(button("保存草稿"));
    expect(mutations.save).not.toHaveBeenCalled();

    await act(async () => firstBatch.resolve());
    await waitFor(() =>
      expect(
        screen
          .getAllByLabelText("英式英语文本")
          .some(
            (input) =>
              (input as HTMLTextAreaElement).value === "British first batch"
          )
      ).toBe(true)
    );
    expect(button("保存草稿")).toBeDisabled();
    fireEvent.click(button("保存草稿"));
    expect(mutations.save).not.toHaveBeenCalled();

    await act(async () => secondBatch.resolve());
    await waitFor(() => expect(button("保存草稿")).toBeEnabled());
    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedSentences =
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].sentences;
    expect(savedSentences[0].en_text.uk).toMatchObject({
      state: "ready",
      variant: { value: { text: "British first batch" } }
    });
    meaningDialectSuggestionBatchRunner.run = realRunner;
  });

  it("T62 补全期间锁定方言内容，请求失败后保留原文并允许重试", async () => {
    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    sentence.en_text.uk = { state: "missing" };
    const pending = deferred<never>();
    mutations.suggest.mockReturnValueOnce(pending.promise);
    mutations.suggest.mockResolvedValueOnce({
      suggestions: [
        {
          client_id: sentence.id,
          field_kind: "example",
          value: {
            version: 1,
            text: "The British retry succeeded.",
            spans: [],
            liaisons: []
          },
          model_version: "mock-v1"
        }
      ]
    });
    renderStep(word);

    selectMeaningDialect("英式");
    await waitFor(() => expect(mutations.suggest).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText("词义内容方言")).toHaveClass(
        "ant-segmented-disabled"
      )
    );
    const targetInput = screen
      .getAllByLabelText("英式英语文本")
      .find((input) => (input as HTMLTextAreaElement).value === "")!;
    expect(targetInput).toHaveAttribute("readonly");

    await act(async () => pending.reject(new Error("服务暂不可用")));

    expect(await screen.findByText("服务暂不可用")).toBeInTheDocument();
    expect(targetInput).toHaveValue("");
    await act(async () => {
      button("重试补全 1 项").click();
      await Promise.resolve();
    });
    await waitFor(() => expect(mutations.suggest).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen
          .getAllByLabelText("英式英语文本")
          .some(
            (input) =>
              (input as HTMLTextAreaElement).value ===
              "The British retry succeeded."
          )
      ).toBe(true)
    );
  });

  it("统一英语文本通过完整性校验并可完成 meanings", async () => {
    const word = wordFixture({ headword: "far", ready: true });
    renderStep(word);

    fireEvent.click(button("完成并进入预览"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save.mock.calls[0]![0].intent).toBe("complete");
  });

  it("T62-T63 服务未接入时仍可切换和手填，但全局补全入口禁用且不发请求", () => {
    dataSourceCapabilities.dialectVariantSuggestions = false;
    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    sentence.en_text.uk = { state: "missing" };
    renderStep(word);

    selectMeaningDialect("英式");
    expect(button("自动补全 1 项")).toBeDisabled();
    expect(button("自动补全 1 项")).toHaveAttribute(
      "title",
      "真实方言建议服务尚未接入，请手工填写"
    );
    const manualInput = screen
      .getAllByLabelText("英式英语文本")
      .find((input) => (input as HTMLTextAreaElement).value === "")!;
    fireEvent.change(manualInput, {
      target: { value: "Manual British text" }
    });
    expect(manualInput).toHaveValue("Manual British text");
    expect(mutations.suggest).not.toHaveBeenCalled();
  });

  it("服务端 field issue 切换所属词性并聚焦稳定 node/field", async () => {
    const issue = {
      step: "meanings" as const,
      node_id: "mock-sense-2-1",
      field: "sub_pos",
      code: "required",
      message: "请选择细分词性"
    };
    mutations.save.mockRejectedValue(
      new HttpError(422, "invalid meanings", [], undefined, [issue])
    );
    const { router } = renderStep();

    fireEvent.click(button("保存草稿"));

    await waitFor(() =>
      expect(router.state.location.state).toEqual({
        nodeId: issue.node_id,
        field: issue.field
      })
    );
    await waitFor(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-word-node-id="${issue.node_id}"][data-word-field="${issue.field}"]`
      );
      expect(target).not.toBeNull();
      expect(target).toHaveClass("word-validation-focus");
      expect(target).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it("空语义区间定位到集合卡片并聚焦添加按钮", async () => {
    const word = wordFixture({ ready: true });
    word.meanings.sense_groups = [];
    renderStep(word, false, {
      nodeId: word.id,
      field: "sense_groups"
    });

    await waitFor(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-word-node-id="${word.id}"][data-word-field="sense_groups"]`
      );
      expect(target).not.toBeNull();
      expect(target).toHaveClass("word-validation-focus");
      expect(target).toContainElement(document.activeElement as HTMLElement);
      expect(document.activeElement).toHaveTextContent("添加语义区间");
    });
  });

  it("定位非当前方言内容时切换方言并聚焦真实输入框", async () => {
    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    if (word.headwords.mode !== "distinguish") {
      throw new Error("fixture must distinguish headwords");
    }
    expect(word.headwords.source_dialect).toBe("us");
    sentence.en_text.uk = { state: "missing" };

    renderStep(word, false, {
      nodeId: sentence.id,
      field: "content.uk"
    });

    await waitFor(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-word-node-id="${sentence.id}"][data-word-field="content.uk"]`
      );
      expect(target).not.toBeNull();
      expect(target).toHaveClass("word-validation-focus");
      expect(target).toContainElement(document.activeElement as HTMLElement);
      expect(document.activeElement).toHaveAccessibleName("英式英语文本");
    });
  });

  it("校验定位后手动切换词性，输入时不再跳回原词性", async () => {
    renderStep(wordFixture({ ready: true }), false, {
      nodeId: "mock-sense-1-1",
      field: "sub_pos"
    });

    const nounTab = screen.getByRole("tab", { name: /名词/ });
    const verbTab = screen.getByRole("tab", { name: /动词/ });
    await waitFor(() =>
      expect(nounTab).toHaveAttribute("aria-selected", "true")
    );
    fireEvent.click(verbTab);
    await waitFor(() =>
      expect(verbTab).toHaveAttribute("aria-selected", "true")
    );

    const visibleFrequency = screen
      .getAllByLabelText("词频")
      .find((input) => input.closest("[aria-hidden='true']") === null);
    expect(visibleFrequency).toBeDefined();
    fireEvent.change(visibleFrequency!, { target: { value: "42" } });

    expect(verbTab).toHaveAttribute("aria-selected", "true");
  });

  it("可组合编辑语法、释义、例句、上下文关联与语义区间", async () => {
    renderStep();

    fireEvent.change(screen.getAllByLabelText("英式语法结构 1")[0]!, {
      target: { value: "an edited centre" }
    });
    fireEvent.change(screen.getAllByLabelText("美式语法结构 1")[0]!, {
      target: { value: "an edited center" }
    });
    fireEvent.click(enabledButton("添加语法结构"));
    const sourceHandle = await screen.findByLabelText("拖动语法结构 2");
    const targetHandle = screen.getByLabelText("拖动语法结构 1");
    const target = targetHandle.closest(".word-grammar-row")!;
    const store = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types: ["application/x-tsz-grammar-structure"],
      setData: (type: string, data: string) => store.set(type, data),
      getData: (type: string) => store.get(type) ?? ""
    };
    fireEvent.dragStart(sourceHandle, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(sourceHandle, { dataTransfer });
    fireEvent.click(screen.getByLabelText("删除语法结构 1"));

    fireEvent.click(enabledButton("添加语义区间"));
    const groupInputs = screen.getAllByLabelText(/^语义区间 \d+ 中文$/);
    const groupEnglishInputs = screen.getAllByLabelText(/^语义区间 \d+ 英文$/);
    fireEvent.change(groupInputs.at(-1)!, { target: { value: "新增区间" } });
    fireEvent.change(groupEnglishInputs.at(-1)!, {
      target: { value: "New range" }
    });
    fireEvent.click(
      screen.getByLabelText(`删除语义区间 ${groupInputs.length}`)
    );

    fireEvent.click(enabledButton("添加释义"));
    const definitions = screen.getAllByLabelText("中文释义");
    fireEvent.change(definitions.at(-1)!, {
      target: { value: "新增释义" }
    });
    fireEvent.keyDown(await screen.findByLabelText("拖动释义 2"), {
      key: "ArrowUp"
    });
    fireEvent.click(screen.getByLabelText("删除释义 1"));

    fireEvent.click(enabledButton("添加例句"));
    const translations = screen.getAllByLabelText("汉语译文");
    fireEvent.change(translations.at(-1)!, {
      target: { value: "新增例句译文" }
    });
    await selectContextTarget(
      screen.getAllByLabelText("搜索并添加上下文关联").at(-1)!,
      "colour",
      "colour · 颜色"
    );
    expect(screen.getAllByLabelText("上下文词条 ID").at(-1)).toHaveValue(
      "fixture-colour"
    );
    expect(screen.getAllByLabelText("上下文词义 ID").at(-1)).toHaveValue(
      "fixture-colour-sense"
    );
    fireEvent.click(screen.getByLabelText("删除上下文关联 1"));
    fireEvent.keyDown(await screen.findByLabelText("拖动例句 2"), {
      key: "ArrowUp"
    });
    fireEvent.click(screen.getByLabelText("删除例句 1"));

    fireEvent.click(enabledButton("添加近义词"));
    expect(screen.getByLabelText("近义词目标词条")).toHaveValue("");
    expect(screen.queryByRole("dialog")).toBeNull();
    await selectInlineRelatedWord("近义词", "colour", "colour");
    const relationRow = screen
      .getByLabelText("近义词目标词条")
      .closest(".word-relation-row") as HTMLElement;
    expect(screen.getByLabelText("近义词目标词条")).toHaveValue("colour");
    expect(within(relationRow).getByText("选择词义")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("相似度").at(-1)!, {
      target: { value: "75" }
    });
    fireEvent.change(screen.getAllByLabelText("相似度").at(-1)!, {
      target: { value: "" }
    });
    fireEvent.click(screen.getByLabelText("删除近义词"));

    fireEvent.click(screen.getByLabelText("是否依赖语境"));
    fireEvent.change(screen.getByLabelText("词频"), { target: { value: "" } });

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const content = mutations.save.mock.calls[0]![0].content;
    expect(content.pos[0].grammar_structures).toHaveLength(1);
    expect(content.pos[0].senses[0].definitions).toHaveLength(1);
    expect(content.pos[0].senses[0].sentences).toHaveLength(1);
    expect(content.pos[0].senses[0].frequency).toBeUndefined();
  }, 15_000);

  it("多维例句同时展示并保存英文例句与汉语译文", async () => {
    featureFlags.VOICE_EDITOR = true;
    renderStep();

    expect(screen.getAllByText("英文例句").length).toBeGreaterThan(0);
    expect(screen.getAllByText("汉语译文").length).toBeGreaterThan(0);
    const englishText = screen.getAllByLabelText(/英语文本/)[0]!;
    const englishCard = englishText.closest<HTMLElement>(
      ".word-sentence-english-card"
    );
    expect(englishCard).not.toBeNull();
    expect(within(englishCard!).getByText("英文例句")).toBeInTheDocument();
    expect(
      within(englishCard!).getByRole("note", { name: "例句主关联" })
    ).toHaveTextContent("已自动关联当前词义");
    expect(
      within(englishCard!).getByLabelText(/高级语音编辑/)
    ).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("汉语译文")[0]!, {
      target: { value: "这是更新后的汉语译文。" }
    });

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].sentences[0]
        .zh_text.text
    ).toBe("这是更新后的汉语译文。");
  });

  it("统一词形的已发布内容只读展示 common 文本，不暴露结构编辑操作", () => {
    const word = wordFixture({
      headword: "far",
      ready: true,
      status: "published"
    });
    renderStep(word, true);

    expect(screen.getAllByLabelText("英语文本").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("中文释义")[0]).toHaveAttribute("readonly");
    expect(screen.getByLabelText("默认语法结构 1 获取语音")).toBeDisabled();
    expect(screen.queryByLabelText("默认语法结构 1 上传语音")).toBeNull();
    expect(screen.queryByText("添加语法结构")).toBeNull();
    expect(screen.queryByText("添加词义")).toBeNull();
    expect(screen.queryByText("保存草稿")).toBeNull();
  });

  it("普通文本可直接编辑，按需打开高级语音编辑并按稳定节点回写", async () => {
    featureFlags.VOICE_EDITOR = true;
    const word = wordFixture({ ready: true });
    const firstDefinition = word.meanings.pos[0]!.senses[0]!.definitions[0]!;
    firstDefinition.definition_mode = "en_definition";
    firstDefinition.content = {
      mode: "distinguish",
      source_dialect: "us",
      uk: {
        state: "ready",
        variant: {
          id: "voice-definition-uk",
          value: {
            version: 1,
            text: "British definition",
            spans: [],
            liaisons: []
          },
          origin: "manual"
        }
      },
      us: {
        state: "ready",
        variant: {
          id: "voice-definition-us",
          value: {
            version: 1,
            text: "American definition",
            spans: [],
            liaisons: []
          },
          origin: "manual"
        }
      }
    };
    renderStep(word);

    const plainDefinition = screen.getByDisplayValue("American definition");
    expect(plainDefinition).toBeInstanceOf(HTMLTextAreaElement);
    fireEvent.change(plainDefinition, {
      target: { value: "American definition updated" }
    });
    expect(screen.queryByLabelText("测试语音编辑器")).toBeNull();

    const applyField = async (text: string) => {
      const field = screen.getByDisplayValue(text);
      if (!field) throw new Error(`voice field not found: ${text}`);
      const editButton =
        field
          .closest(".word-voice-text-control")
          ?.querySelector('button[aria-label$="高级语音编辑"]') ??
        field
          .closest(".dialect-panel")
          ?.querySelector('button[aria-label$="高级语音编辑"]');
      if (!editButton) throw new Error(`edit button not found: ${text}`);
      expect(editButton).toHaveClass("word-voice-editor-action");
      expect(editButton).toHaveTextContent("高级语音编辑");
      expect(editButton.closest(".ant-space-compact")).toBeNull();
      fireEvent.click(editButton);
      const dialog = await screen.findByLabelText("测试语音编辑器");
      expect(dialog).toHaveAttribute("data-pronunciation-hint", "ˈsentə");
      expect(dialog).toHaveAttribute("data-preview-enabled", "false");
      const applyButton = dialog.querySelector("button");
      if (!applyButton) throw new Error(`apply button not found: ${text}`);
      fireEvent.click(applyButton);
      await waitFor(() =>
        expect(screen.queryByLabelText("测试语音编辑器")).toBeNull()
      );
    };

    await applyField("a centre");
    await applyField("American definition updated");
    await applyField("The center is here.");
    expect(screen.getAllByLabelText("汉语译文")[0]).toBeInstanceOf(
      HTMLTextAreaElement
    );

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledOnce());
    const saved = mutations.save.mock.calls[0]![0]
      .content as DraftMeaningsStepContent;
    expect(
      saved.pos[0]!.grammar_structures[0]!.variants[0]!.content.version
    ).toBe(2);
    const savedDefinition = saved.pos[0]!.senses[0]!.definitions[0]!;
    expect(savedDefinition.definition_mode).toBe("en_definition");
    const definitionContent = savedDefinition.content as EnglishTextV2;
    if (definitionContent.mode !== "distinguish") {
      throw new Error("definition should retain dialect structure");
    }
    expect(definitionContent.us.state).toBe("ready");
    expect(
      definitionContent.us.state === "ready"
        ? definitionContent.us.variant.value.version
        : undefined
    ).toBe(2);
    expect(
      definitionContent.uk.state === "ready"
        ? definitionContent.uk.variant.value.version
        : undefined
    ).toBe(1);
    const sentenceText = saved.pos[0]!.senses[0]!.sentences[0]!.en_text;
    expect(
      sentenceText.mode === "distinguish" && sentenceText.us.state === "ready"
        ? sentenceText.us.variant.value.version
        : undefined
    ).toBe(2);
  });

  it("主关联缺失时只读页明确标错", () => {
    const word = wordFixture({ ready: true, status: "published" });
    word.meanings.pos[0]!.senses[0]!.sentences[0]!.links = [];
    renderStep(word, true);
    expect(screen.getByRole("note", { name: "例句主关联" })).toHaveTextContent(
      "主关联缺失"
    );
  });

  it.each([
    [
      "语义区间中文名缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.sense_groups = [
          { id: "group-missing-zh", name_zh: "  ", name_en: "Space" }
        ];
      },
      "请填写语义区间 1 的中文名"
    ],
    [
      "语义区间英文名缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.sense_groups = [
          { id: "group-missing-en", name_zh: "空间", name_en: "" }
        ];
      },
      "请填写语义区间 1 的英文名"
    ],
    [
      "语义区间中文名超长",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.sense_groups = [
          {
            id: "group-long-zh",
            name_zh: "中".repeat(201),
            name_en: "Space"
          }
        ];
      },
      "语义区间 1 的中文名不能超过 200 个字符"
    ],
    [
      "缺少语法结构",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.grammar_structures = [];
      },
      "每个词性至少需要一条语法结构"
    ],
    [
      "缺少词义",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses = [];
      },
      "每个词性至少需要一个词义"
    ],
    [
      "缺少细分词性",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.sub_pos = "";
      },
      "请为每个词义选择细分词性"
    ],
    [
      "缺少中文释义",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.definitions = [];
      },
      "每个词义至少需要一条中文释义"
    ],
    [
      "英文释义方言不完整",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.definitions.push({
          id: "english-definition",
          level: "A1",
          definition_mode: "en_definition",
          content: {
            mode: "distinguish",
            source_dialect: "us",
            uk: { state: "missing" },
            us: {
              state: "ready",
              variant: {
                id: "english-definition-us",
                origin: "manual",
                value: {
                  version: 1,
                  text: "center",
                  spans: [],
                  liaisons: []
                }
              }
            }
          }
        });
      },
      "请补齐英文释义的全部启用方言文本"
    ],
    [
      "例句译文缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.sentences[0]!.zh_text.text = "";
      },
      "请补齐例句的英文文本和汉语译文"
    ],
    [
      "例句主关联缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.sentences[0]!.links = [];
      },
      "每条例句必须保留唯一的当前词义主关联"
    ],
    [
      "关系词目标缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.relations.push({
          id: "missing-target",
          relation: "synonym",
          target_word_id: "",
          target_sense_id: "",
          score: "50"
        });
      },
      "请为每个关系词选择具体词条和词义"
    ],
    [
      "关系词分值越界",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.relations.push({
          id: "invalid-score",
          relation: "synonym",
          target_word_id: "word-2",
          target_sense_id: "sense-2",
          score: "100.001"
        });
      },
      "关系词分值必须是 0–100 且最多两位小数"
    ]
  ])("完整性校验覆盖%s", async (_name, mutate, expected) => {
    const word = wordFixture({ ready: true });
    mutate(word);
    renderStep(word);
    fireEvent.click(button("完成并进入预览"));
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(mutations.save).not.toHaveBeenCalled();
  });
});
