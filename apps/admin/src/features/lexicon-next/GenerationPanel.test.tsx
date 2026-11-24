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
import { FormGenerationResult } from "./FormGenerationResult";

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
    const generate = vi.fn(async (_id: string, input: NextAgentInput) =>
      result(input)
    );
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
      <FormGenerationResult
        headword="center"
        sources={[
          {
            source: "Merriam-Webster",
            locator: "https://www.merriam-webster.com/dictionary/center",
            status: "found",
            excerpt:
              "center · 词性 noun、verb · 读音标记 ˈsen-tər · 词形 noun [] · 词形 verb [centered、centering]"
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
  expect(verb.getByText("2 项")).toBeVisible();
  expect(verb.getByText("centered")).toBeVisible();
  expect(verb.getByText("centering")).toBeVisible();
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
