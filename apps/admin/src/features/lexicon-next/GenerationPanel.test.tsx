import { webcrypto } from "node:crypto";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import type {
  AssistantCandidatePos,
  NextAgentInput,
  NextAgentResult,
  NextDraft
} from "@tsz/types";
import {
  EntryAssistantButton,
  SectionAI,
  GenerationSenseScope
} from "./GenerationActions";
import { GenerationPanel } from "./GenerationPanel";
import { GenerationResult } from "./GenerationResult";

function result(input: NextAgentInput): NextAgentResult {
  return {
    run_id: input.run_id,
    snapshot_id: input.snapshot_id,
    base_revision: input.base_revision,
    done: true,
    requires_human_review: true,
    steps: [{ section: "definitions", state: "completed", error: "" }],
    sources: [],
    proposals: {
      dialect: [],
      forms: [],
      senses: [],
      groups: [],
      grammar: [],
      definitions: [{ sense: 0, english: "Next day", explanation: "第二天" }],
      examples: [],
      translations: [],
      equivalents: [],
      relations: []
    }
  };
}
const draft: NextDraft = {
  schema_version: 1,
  headword: "tomorrow",
  forms: [],
  senses: []
};
afterEach(() => vi.unstubAllGlobals());
it.each([true, false])(
  "语义区间先预览再显式回填，按服务能力读回和刷新（%s）",
  async (sectionCandidatesAvailable) => {
    vi.stubGlobal("crypto", webcrypto);
    const groupResult = (input: NextAgentInput, name: string) => {
      const view = result(input);
      view.steps = [{ section: "groups", state: "completed", error: "" }];
      view.proposals.definitions = [];
      view.proposals.groups = [
        { sense: 0, name_zh: name, name_en: "movement" },
        { sense: 1, name_zh: "经营", name_en: "management" }
      ];
      return view;
    };
    let currentRunId = "previous-run";
    const lookup = vi.fn(async (_id: string, input: NextAgentInput) => ({
      candidate: {
        source_run_id: currentRunId,
        generated_at: "2026-11-25T01:00:00Z",
        result: groupResult(
          input,
          currentRunId === "previous-run" ? "快速奔跑" : "步行或跑步"
        )
      }
    }));
    const generate = vi.fn(async (_id: string, input: NextAgentInput) => {
      currentRunId = input.run_id;
      return groupResult(input, "步行或跑步");
    });
    const onFill = vi.fn(() => true);
    render(
      <GenerationPanel
        entryId="entry"
        revision={1}
        draft={{
          ...draft,
          headword: "run",
          senses: ["跑步", "经营业务"].map((text, index) => ({
            id: String(index),
            part_of_speech: "verb",
            definitions: [],
            equivalents: [{ id: text, locale: "zh-Hans", text }]
          }))
        }}
        medium="zh-Hans"
        target="en-GB"
        sections={["groups"]}
        contextVersion="1"
        examples={[]}
        disabled={false}
        generate={generate}
        lookup={lookup}
        sectionCandidatesAvailable={sectionCandidatesAvailable}
        onFill={onFill}
      >
        <SectionAI section="groups" />
      </GenerationPanel>
    );
    fireEvent.click(screen.getByRole("button", { name: "AI 生成语义区间" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(generate).not.toHaveBeenCalled();
    if (sectionCandidatesAvailable) {
      expect(await dialog.findByText("快速奔跑")).toBeVisible();
      expect(generate).not.toHaveBeenCalled();
      fireEvent.click(dialog.getByRole("button", { name: "重新生成" }));
    } else {
      expect(lookup).not.toHaveBeenCalled();
      fireEvent.click(dialog.getByRole("button", { name: "AI 生成语义区间" }));
    }
    expect(await dialog.findByText("步行或跑步")).toBeVisible();
    expect(generate.mock.calls[0]?.[1].force_refresh).toBe(
      sectionCandidatesAvailable ? true : undefined
    );
    expect(
      within(dialog.getByRole("row", { name: /经营业务/ })).getByText(
        "management"
      )
    ).toBeVisible();
    expect(onFill).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "一键配置" }));
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        proposals: expect.objectContaining({ groups: expect.any(Array) })
      }),
      expect.objectContaining({ section: "groups" }),
      []
    );
  }
);

it("等待期间修改本地草稿会阻止迟到的回填", async () => {
  vi.stubGlobal("crypto", webcrypto);
  let finish: () => void = () => {};
  const generate = vi.fn(
    (_id: string, input: NextAgentInput) =>
      new Promise<NextAgentResult>((resolve) => {
        finish = () => resolve(result(input));
      })
  );
  const onFill = vi.fn(() => true);
  const props = {
    entryId: "entry",
    revision: 1,
    draft,
    medium: "zh-Hans",
    target: "en-GB",
    sections: ["definitions" as const],
    contextVersion: "1",
    examples: [],
    disabled: false,
    generate,
    onFill,
    children: <EntryAssistantButton />
  };
  const ui = render(<GenerationPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "词条助手" }));
  fireEvent.click(await screen.findByRole("button", { name: "生成整个词条" }));
  await waitFor(() => expect(generate).toHaveBeenCalledOnce());
  ui.rerender(
    <GenerationPanel {...props} draft={{ ...draft, headword: "tomorrows" }} />
  );
  finish();
  expect(
    await screen.findByText("草稿或编辑状态已变化，请重新生成。")
  ).toBeVisible();
  expect(onFill).not.toHaveBeenCalled();
});
it("失败板块的重试使用新批次，并保留该板块的范围", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const generate = vi.fn(async (_id: string, input: NextAgentInput) => {
    const view = result(input);
    if (input.sections.length > 1)
      view.steps = [
        { section: "definitions", state: "failed", error: "invalid_output" },
        { section: "groups", state: "completed", error: "" }
      ];
    return view;
  });
  render(
    <GenerationPanel
      entryId="entry"
      revision={1}
      draft={draft}
      medium="zh-Hans"
      target="en-GB"
      sections={["definitions", "groups"]}
      contextVersion="1"
      examples={[]}
      disabled={false}
      generate={generate}
      onFill={() => true}
    >
      <EntryAssistantButton />
    </GenerationPanel>
  );
  fireEvent.click(screen.getByRole("button", { name: "词条助手" }));
  fireEvent.click(await screen.findByRole("button", { name: "生成整个词条" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "重新生成释义与解释" })
  );
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  expect(generate.mock.calls[1]![1].sections).toEqual(["definitions"]);
  expect(generate.mock.calls[1]![1].run_id).not.toBe(
    generate.mock.calls[0]![1].run_id
  );
});

it.each(["single", "all"])(
  "selects eligible examples before applying the batch limit (%s)",
  async (scope) => {
    vi.stubGlobal("crypto", webcrypto);
    const examples = Array.from({ length: 51 }, (_, i) => ({
      id: String(i + 1),
      text: "Example " + (i + 1)
    }));
    const generate = vi.fn(async (_id: string, input: NextAgentInput) => {
      const view = result(input);
      view.steps = [{ section: "translations", state: "completed", error: "" }];
      view.proposals.definitions = [];
      view.proposals.translations = [{ example: 0, text: "译文候选" }];
      return view;
    });
    const onFill = vi.fn(() => true);
    render(
      <GenerationPanel
        entryId="entry"
        revision={1}
        draft={draft}
        target="en-GB"
        medium="zh-Hans"
        sections={["translations"]}
        contextVersion="1"
        examples={examples}
        disabled={false}
        generate={generate}
        onFill={onFill}
      >
        <EntryAssistantButton />
        <SectionAI
          section="translations"
          sentenceId="51"
          label="第 51 条译文"
        />
      </GenerationPanel>
    );
    if (scope === "single") {
      fireEvent.click(
        screen.getByRole("button", { name: "AI 生成第 51 条译文" })
      );
      const dialog = within(screen.getByRole("dialog"));
      fireEvent.click(
        dialog.getByRole("button", { name: "AI 生成第 51 条译文" })
      );
      expect(await dialog.findByText("译文候选")).toBeVisible();
      expect(onFill).not.toHaveBeenCalled();
      fireEvent.click(dialog.getByRole("button", { name: "一键配置" }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "词条助手" }));
      fireEvent.click(
        await screen.findByRole("button", { name: "生成整个词条" })
      );
    }
    await waitFor(() => expect(onFill).toHaveBeenCalledOnce());
    const selected =
      scope === "single" ? examples.slice(50) : examples.slice(0, 50);
    expect(generate.mock.calls[0]?.[1].examples).toEqual(
      selected.map((s) => s.text)
    );
    expect(onFill.mock.calls[0]).toEqual([
      expect.anything(),
      expect.anything(),
      selected.map((s) => s.id)
    ]);
  }
);

it("从第二个词义的中文解释发起时，只提交该词义并保留目标语言", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const generate = vi.fn(async (_id: string, input: NextAgentInput) =>
    result(input)
  );
  const onFill = vi.fn(() => true);
  const senses = ["first", "second"].map((id, i) => ({
    id,
    part_of_speech: "noun",
    definitions: [],
    equivalents: [{ id: "e" + i, locale: "zh-Hans", text: i ? "次日" : "未来" }]
  }));
  render(
    <GenerationPanel
      entryId="entry"
      revision={1}
      draft={{ ...draft, senses }}
      medium="zh-Hans"
      target="en-GB"
      sections={["definitions", "groups"]}
      contextVersion="1"
      examples={[]}
      disabled={false}
      generate={generate}
      onFill={onFill}
    >
      <GenerationSenseScope id="second" label="词义 2">
        <SectionAI
          section="definitions"
          locale="zh-Hans"
          label="简体中文解释"
        />
      </GenerationSenseScope>
    </GenerationPanel>
  );
  fireEvent.click(screen.getByRole("button", { name: "AI 生成简体中文解释" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "AI 生成简体中文解释" }));
  expect(await dialog.findByText("第二天")).toBeVisible();
  expect(dialog.queryByText("Next day")).not.toBeInTheDocument();
  expect(onFill).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "一键配置" }));
  await waitFor(() => expect(onFill).toHaveBeenCalledOnce());
  expect(generate.mock.calls[0]![1]).toMatchObject({
    sections: ["definitions"],
    senses: [{ pos: "noun", gloss: "次日" }]
  });
  expect(onFill).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      section: "definitions",
      senseId: "second",
      locale: "zh-Hans"
    }),
    []
  );
});

it("词义目录一并预览和配置有来源的方言建议", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const proposals = {
    senses: [{ pos: "noun", gloss: "公寓", level: "A2" }],
    dialect: [
      {
        sense: 0,
        usage: "en-GB" as const,
        source_locator: "fixture",
        evidence: "British"
      }
    ]
  };
  const generate = vi.fn(async (_id: string, input: NextAgentInput) => {
    const view = result(input);
    view.steps = [
      { section: "senses", state: "completed", error: "" },
      { section: "dialect", state: "completed", error: "" }
    ];
    view.proposals = { ...view.proposals, definitions: [], ...proposals };
    return view;
  });
  const onFill = vi.fn(() => true);
  render(
    <GenerationPanel
      entryId="entry"
      revision={1}
      draft={{ ...draft, headword: "flat" }}
      medium="zh-Hans"
      target="en-GB"
      sections={["senses", "dialect"]}
      contextVersion="1"
      examples={[]}
      disabled={false}
      generate={generate}
      onFill={onFill}
    >
      <SectionAI section="senses" pos="noun" />
    </GenerationPanel>
  );
  fireEvent.click(screen.getByRole("button", { name: "AI 生成词义目录" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "AI 生成词义目录" }));
  const table = within(
    await dialog.findByRole("table", { name: "词义目录候选" })
  );
  expect(table.getByRole("cell", { name: /公寓.*英式专用/s })).toBeVisible();
  expect(generate.mock.calls[0]?.[1].sections).toEqual(["senses", "dialect"]);
  expect(onFill).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "一键配置" }));
  expect(onFill).toHaveBeenCalledWith(
    expect.objectContaining({ proposals: expect.objectContaining(proposals) }),
    expect.objectContaining({ section: "senses" }),
    []
  );
});

it("用参考轮播和紧凑词形表展示同一批生成结果", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const onFill = vi.fn(() => false);
  const generate = vi.fn(
    async (_id: string, input: NextAgentInput): Promise<NextAgentResult> => {
      const view = result(input);
      return {
        ...view,
        steps: [{ section: "forms", state: "completed", error: "" }],
        sources: [
          {
            source: "有道",
            locator: "https://dict.youdao.com/w/eng/center/",
            excerpt:
              "center · 英 [ˈsentə(r)] / 美 [ˈsentər] · 词性 n.、v. · [ 复数 centers ]",
            status: "found"
          },
          {
            source: "Oxford Learner’s Dictionaries",
            locator:
              "https://www.oxfordlearnersdictionaries.com/definition/english/center_1",
            excerpt:
              "Definition of center noun in Oxford Advanced Learner's Dictionary. Meaning, pronunciation, picture, example sentences, grammar, usage notes, synonyms and more.",
            status: "found"
          },
          {
            source: "Merriam-Webster",
            locator: "https://www.merriam-webster.com/dictionary/center",
            excerpt: "",
            status: "unavailable"
          },
          {
            source: "Cambridge Dictionary",
            locator:
              "https://dictionary.cambridge.org/dictionary/english/center",
            excerpt:
              "center · 英 [ˈsen.tə(r)] · 词性 noun、verb · [ 英式拼写 centre、美式拼写 center ]",
            status: "found"
          }
        ],
        proposals: {
          ...view.proposals,
          definitions: [],
          forms: [
            {
              pos: "noun",
              forms: [
                {
                  form_type: "base",
                  is_regular: true,
                  uk: { spelling: "centre", dict_phonetic: "/ˈsentə/" },
                  us: { spelling: "center", dict_phonetic: "/ˈsentər/" }
                }
              ]
            }
          ]
        }
      };
    }
  );
  render(
    <GenerationPanel
      entryId="entry"
      revision={1}
      draft={{
        ...draft,
        headword: "center",
        senses: Array.from({ length: 81 }, (_, index) => ({
          id: `sense-${index}`,
          part_of_speech: "noun",
          equivalents: [
            { id: `word-${index}`, locale: "zh-Hans", text: `词义 ${index}` }
          ],
          definitions: []
        }))
      }}
      medium="zh-Hans"
      target="en-GB"
      sections={["forms"]}
      contextVersion="1"
      examples={[]}
      disabled={false}
      generate={generate}
      onFill={onFill}
    >
      <SectionAI section="forms" />
    </GenerationPanel>
  );

  fireEvent.click(screen.getByRole("button", { name: "AI 生成词形与发音" }));
  const references = within(
    await screen.findByRole("region", { name: "词典参考" })
  );
  expect(references.getByRole("heading", { name: "center" })).toBeVisible();
  expect(references.getByText("名词 · 动词")).toBeVisible();
  expect(references.getByText("[ˈsentə(r)]")).toBeVisible();
  expect(references.getByText("centers")).toBeVisible();
  const youdao = within(references.getByRole("group", { name: "有道" }));
  expect(youdao.getByText("发音")).toBeVisible();
  expect(
    within(youdao.getByRole("group", { name: "名词" })).getByText("复数")
  ).toBeVisible();
  const switcher = within(references.getByRole("group", { name: "词典参考" }));
  expect(switcher.getAllByRole("button")).toHaveLength(4);
  fireEvent.click(references.getByRole("button", { name: "下一个词典" }));
  expect(references.getByText("名词")).toBeVisible();
  expect(
    references.getByText("本次只取得词条索引，可打开原词条查看释义。")
  ).toBeVisible();
  fireEvent.click(switcher.getByRole("button", { name: "韦氏" }));
  expect(
    switcher.getByRole("button", { name: "韦氏", pressed: true })
  ).toBeVisible();
  expect(references.getByText("未能取得资料")).toBeVisible();
  expect(references.getAllByText("未返回资料")).toHaveLength(3);
  expect(references.getByRole("link", { name: "打开原词条" })).toHaveAttribute(
    "href",
    "https://www.merriam-webster.com/dictionary/center"
  );
  fireEvent.click(switcher.getByRole("button", { name: "剑桥" }));
  const cambridge = within(references.getByRole("group", { name: "剑桥" }));
  expect(cambridge.getByText("发音")).toBeVisible();
  expect(cambridge.getByText("词形")).toBeVisible();
  const spellings = within(cambridge.getByRole("group", { name: "拼写变体" }));
  expect(spellings.getByText("centre")).toBeVisible();
  expect(spellings.getByText("美式拼写")).toBeVisible();

  const candidates = within(screen.getByRole("table", { name: "生成词形" }));
  expect(
    candidates.getByRole("rowheader", { name: "名词 1 种词形" })
  ).toBeVisible();
  expect(candidates.getByText("centre")).toBeVisible();
  expect(candidates.getByText("center")).toBeVisible();
  expect(candidates.getByText("/ˈsentər/")).toBeVisible();
  expect(onFill).toHaveBeenCalledOnce();
  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0]?.[1].senses).toEqual([]);
});

it("已加载旧文案的页面仍按词性显示韦氏变形和候选词形计数", () => {
  const row = (
    form_type: AssistantCandidatePos["forms"][number]["form_type"],
    spelling: string
  ) => ({
    form_type,
    is_regular: true,
    uk: { spelling, dict_phonetic: "" },
    us: { spelling, dict_phonetic: "" }
  });
  const previousTranslations = {
    "zh-Hans": {
      adminLexiconFormGeneration: {
        entry_ai_dictionary_references: "词典参考",
        entry_ai_source_merriam: "韦氏",
        entry_ai_generated_forms: "生成词形"
      },
      adminLexiconDictionaryReference: { summary: "词条摘要" }
    }
  };
  render(
    <InterfaceI18nProvider resources={previousTranslations}>
      <GenerationResult
        section="forms"
        headword="center"
        sources={[
          {
            source: "Merriam-Webster",
            locator: "https://www.merriam-webster.com/dictionary/center",
            status: "found",
            excerpt:
              "center · 词性 noun、verb · 读音标记 ˈsen-tər · 词形 noun [] · 词形 verb [centered、centering、centred]"
          }
        ]}
        forms={[
          {
            pos: "noun",
            forms: [row("base", "center"), row("plural", "centers")]
          },
          {
            pos: "verb",
            forms: [
              row("base", "center"),
              row("third_person_singular", "centers"),
              row("present_participle", "centering"),
              row("past_tense", "centered"),
              row("past_participle", "centered")
            ]
          }
        ]}
      />
    </InterfaceI18nProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "韦氏" }));
  const webster = within(screen.getByRole("group", { name: "韦氏" }));
  const noun = within(webster.getByRole("group", { name: "名词" }));
  const verb = within(webster.getByRole("group", { name: "动词" }));
  expect(noun.getByText("本次未返回变形")).toBeVisible();
  expect(noun.queryByText("centered")).not.toBeInTheDocument();
  expect(verb.getByText("4 项")).toBeVisible();
  expect(verb.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
    ["现在分词centering", "过去式centered", "过去分词centered", "centred"]
  );
  expect(webster.getByText("原站读音标记")).toBeVisible();

  const candidates = within(screen.getByRole("table", { name: "生成词形" }));
  expect(
    candidates.getByRole("rowheader", { name: "名词 2 种词形" })
  ).toBeVisible();
  expect(
    candidates.getByRole("rowheader", { name: "动词 5 种词形" })
  ).toBeVisible();
  expect(candidates.getByRole("rowheader", { name: "过去式" })).toBeVisible();
  expect(candidates.getByRole("rowheader", { name: "过去分词" })).toBeVisible();
});

it("重开语法面板只读旧候选，显式使用或刷新，并随方言切换隐藏旧结果", async () => {
  vi.stubGlobal("crypto", webcrypto);
  function grammar(input: NextAgentInput, pattern: string) {
    const response = result(input);
    response.steps = [{ section: "grammar", state: "completed", error: "" }];
    response.sources = [
      {
        source: "Oxford Learner’s Dictionaries",
        locator: "",
        excerpt:
          "Definition of tomorrow noun in Oxford Advanced Learner's Dictionary.",
        status: "found"
      },
      {
        source: "Cambridge Dictionary",
        locator: "",
        excerpt: "tomorrow · 句型 by + day",
        status: "found"
      }
    ];
    response.proposals.definitions = [];
    response.proposals.grammar = [{ pos: "noun", pattern, sub_pos: "N-COUNT" }];
    return response;
  }
  let sourceRunId = "previous-run";
  const refreshedTime = "2026-11-25T00:00:00Z";
  const lookup = vi.fn(async (_id: string, input: NextAgentInput) => ({
    candidate:
      input.target === "en-GB"
        ? {
            source_run_id: sourceRunId,
            generated_at:
              sourceRunId === "previous-run"
                ? "2026-11-24T00:00:00Z"
                : refreshedTime,
            result: grammar(
              input,
              sourceRunId === "previous-run" ? "by tomorrow" : "until tomorrow"
            )
          }
        : null
  }));
  const generate = vi.fn(async (_id: string, input: NextAgentInput) => {
    sourceRunId = input.run_id;
    return grammar(input, "until tomorrow");
  });
  const fillError = "草稿内容已超出数量限制，请缩小生成范围。";
  const onFill = vi
    .fn((_result: NextAgentResult) => true)
    .mockImplementationOnce(() => {
      throw new Error(fillError);
    });
  const props = {
    entryId: "entry",
    revision: 7,
    catalog: partOfSpeechCatalogFixture,
    draft,
    medium: "zh-Hans",
    target: "en-GB",
    sections: ["grammar" as const],
    contextVersion: "1",
    examples: [],
    disabled: false,
    generate,
    lookup,
    onFill,
    children: <SectionAI section="grammar" pos="noun" />
  };
  const ui = render(<GenerationPanel {...props} />);
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "AI 生成语法结构" }));
  open();
  const candidates = within(
    await screen.findByRole("table", { name: "生成语法结构" })
  );
  expect(candidates.getByRole("rowheader", { name: "名词" })).toBeVisible();
  expect(candidates.getByRole("cell", { name: "可数名词" })).toBeVisible();
  expect(
    candidates.getByRole("columnheader", { name: "语法结构 · 英式" })
  ).toBeVisible();
  expect(candidates.getByRole("cell", { name: "by tomorrow" })).toBeVisible();
  const references = within(screen.getByRole("region", { name: "词典参考" }));
  expect(
    references.getByRole("button", { name: "剑桥", pressed: true })
  ).toBeVisible();
  expect(
    within(references.getByRole("group", { name: "剑桥" })).getByText(
      "已取得参考"
    )
  ).toBeVisible();
  const grammarReference = within(
    references.getByRole("region", { name: "语法参考" })
  );
  expect(
    within(grammarReference.getByRole("list", { name: "原站句型" })).getByText(
      "by + day"
    )
  ).toBeVisible();
  fireEvent.click(references.getByRole("button", { name: "有道" }));
  expect(references.getByRole("group", { name: "有道" })).toBeVisible();
  expect(references.queryByText("by + day")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("板块进度与来源"));
  expect(screen.getByText("生成于")).toBeVisible();
  expect(generate).not.toHaveBeenCalled();
  expect(onFill).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  open();
  expect(await screen.findByText("by tomorrow")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "剑桥", pressed: true })
  ).toBeVisible();
  expect(lookup).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "一键配置" }));
  expect(screen.getByRole("alert")).toHaveTextContent(fillError);
  expect(screen.getByText("by tomorrow")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "一键配置" }));
  expect(screen.queryByText(fillError)).not.toBeInTheDocument();
  expect(onFill).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
  expect(await screen.findByText("until tomorrow")).toBeVisible();
  expect(generate).toHaveBeenCalledWith(
    "entry",
    expect.objectContaining({ force_refresh: true, existing_pos: ["noun"] }),
    expect.any(AbortSignal)
  );
  expect(onFill).toHaveBeenCalledTimes(2);

  await waitFor(() =>
    expect(screen.getByText("生成于").querySelector("time")).toHaveAttribute(
      "datetime",
      refreshedTime
    )
  );

  expect(lookup.mock.lastCall?.[1]).not.toHaveProperty("force_refresh");

  generate.mockImplementationOnce(async (_id, input) => {
    const failed = grammar(input, "");
    failed.steps = [
      { section: "grammar", state: "failed", error: "provider_error" }
    ];
    failed.proposals.grammar = [];
    return failed;
  });
  fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
  expect(await screen.findByText("本次没有可回填的候选。")).toBeVisible();
  expect(screen.getByText("until tomorrow")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "一键配置" }));
  expect(onFill.mock.lastCall?.[0]).toMatchObject({
    proposals: { grammar: [{ pattern: "until tomorrow" }] }
  });

  lookup.mockResolvedValueOnce({ candidate: null });
  generate.mockRejectedValueOnce(new Error("生成服务暂不可用"));
  const beforeFailure = lookup.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "生成服务暂不可用"
  );
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(beforeFailure + 1));
  fireEvent.click(screen.getByRole("button", { name: "一键配置" }));
  expect(onFill.mock.lastCall?.[0]).toMatchObject({
    proposals: { grammar: [{ pattern: "until tomorrow" }] }
  });

  ui.rerender(<GenerationPanel {...props} target="en-US" />);
  expect(screen.queryByText("until tomorrow")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "一键配置" })
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(lookup).toHaveBeenLastCalledWith(
      "entry",
      expect.objectContaining({ target: "en-US" }),
      expect.any(AbortSignal)
    )
  );

  generate.mockImplementationOnce(async (_id, input) => {
    const empty = grammar(input, "");
    empty.proposals.grammar = [];
    return empty;
  });
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "AI 生成语法结构"
    })
  );
  expect(await screen.findByText("没有语法结构候选")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "一键配置" })
  ).not.toBeInTheDocument();
});
