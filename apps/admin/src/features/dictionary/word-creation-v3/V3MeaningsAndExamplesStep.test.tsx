import { fireEvent, render, screen, within } from "@testing-library/react";
import { App as AntApp } from "antd";
import type {
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  PartOfSpeechCatalogResponse,
  V3DraftValidationIssue
} from "@tsz/types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureV3MeaningsForForms, toWritableMeanings } from "./meaningsModel";
import { V3MeaningsAndExamplesStep } from "./V3MeaningsAndExamplesStep";
import { uuidFromInt, uuidSequence } from "./fixtures";

const meaningsCss = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith("/apps/admin")
      ? "src/features/dictionary/word-creation/word-creation.css"
      : "apps/admin/src/features/dictionary/word-creation/word-creation.css"
  ),
  "utf8"
);

const v3LayoutCss = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith("/apps/admin")
      ? "src/features/dictionary/word-creation-v3/v3-layout.css"
      : "apps/admin/src/features/dictionary/word-creation-v3/v3-layout.css"
  ),
  "utf8"
);

const relatedSearchAny = vi.hoisted(() =>
  vi.fn(
    (_query: string, _kind: "word" | "phrase" | undefined, _open: boolean) => ({
      exact: {
        data: {
          pages: [
            {
              results: [
                {
                  schema_version: 2 as const,
                  word_id: "external-word-1",
                  headword: "outside",
                  kind: "phrase" as const,
                  dialects: ["common" as const],
                  headword_variants: [],
                  pos_labels: ["名词"],
                  senses: [
                    { sense_id: "external-sense-1", gloss: "外部词义一" }
                  ]
                }
              ],
              total: 1,
              next_cursor: null
            }
          ]
        },
        isFetching: false,
        isError: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn()
      },
      contains: {
        data: {
          pages: [
            {
              results: [
                {
                  schema_version: 3 as const,
                  entry_id: "external-word-2",
                  kind: "word" as const,
                  presentation: {
                    label: "beyond",
                    matched_surfaces: ["beyond"],
                    strategy_version: "surface_summary_v1"
                  },
                  matches: [],
                  senses: [
                    { sense_id: "external-sense-2", gloss: "外部词义二" }
                  ]
                }
              ],
              total: 1,
              next_cursor: null
            }
          ]
        },
        isFetching: false,
        isError: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn()
      }
    })
  )
);

vi.mock("../api", () => ({ useRelatedSearchAny: relatedSearchAny }));
const defaultRelatedSearchImplementation =
  relatedSearchAny.getMockImplementation()!;

const meaningsFixture: DraftMeaningsStepContentWritableV3 = {
  sense_groups: [{ id: "sense-group-1", name_zh: "核心", name_en: "Core" }],
  pos: [
    {
      pos_id: "pos-1",
      grammar_structures: [
        {
          id: "grammar-1",
          variants: [
            {
              id: "grammar-variant-1",
              dialect: "common",
              content: { version: 2, text: "used as a noun", annotations: [] }
            }
          ]
        }
      ],
      senses: [
        {
          id: "sense-1",
          sub_pos: "countable",
          level: "A1",
          sense_group_id: "sense-group-1",
          frequency: "50",
          depends_on_context: false,
          definitions: [
            {
              id: "definition-1",
              level: "A1",
              grammar_structure_id: "grammar-1",
              definition_mode: "zh_definition",
              content_id: "definition-content-1",
              content: { version: 2, text: "中心", annotations: [] }
            }
          ],
          sentences: [
            {
              id: "sentence-1",
              level: "A1",
              en_text: {
                mode: "unified",
                common: {
                  id: "sentence-en-1",
                  origin: "manual",
                  value: {
                    version: 2,
                    text: "The city center is busy.",
                    annotations: []
                  }
                }
              },
              zh_text_id: "sentence-zh-1",
              zh_text: { version: 2, text: "市中心很繁忙。", annotations: [] },
              zh_translations: [
                {
                  id: "sentence-zh-1",
                  band: "a1_a2",
                  content: {
                    version: 2,
                    text: "市中心很繁忙。",
                    annotations: []
                  }
                }
              ],
              links: [{ word_id: "entry-1", sense_id: "sense-1", role: "head" }]
            }
          ],
          relations: [
            {
              id: "relation-1",
              relation: "synonym",
              target_word_id: "target-entry",
              target_sense_id: "target-sense",
              score: "0.8"
            }
          ]
        }
      ]
    }
  ]
};

function Harness({
  initial = structuredClone(meaningsFixture),
  issues = [],
  onSave = vi.fn().mockResolvedValue(undefined),
  idFactory,
  forms,
  onFormsChange,
  partOfSpeechCatalog,
  partOfSpeechCatalogError,
  partOfSpeechCatalogPending,
  wordId,
  relationSnapshots,
  draftRelationPrebindingEnabled = true
}: {
  initial?: DraftMeaningsStepContentWritableV3;
  issues?: V3DraftValidationIssue[];
  onSave?: (
    content: DraftMeaningsStepContentWritableV3,
    intent: "save" | "complete"
  ) => Promise<void>;
  idFactory?: () => string;
  forms?: DraftFormsStepContentV3;
  onFormsChange?: (next: DraftFormsStepContentV3) => void;
  partOfSpeechCatalog?: PartOfSpeechCatalogResponse;
  partOfSpeechCatalogError?: boolean;
  partOfSpeechCatalogPending?: boolean;
  wordId?: string;
  relationSnapshots?: Readonly<
    Record<
      string,
      {
        headword?: string;
        gloss?: string;
        prebinding_state?: "waiting_first_sense" | "target_sense_deleted";
        target_status?: "draft" | "published" | "archived";
      }
    >
  >;
  draftRelationPrebindingEnabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [formsValue, setFormsValue] = useState(forms);
  const [activePosId, setActivePosId] = useState(
    initial.pos[0]?.pos_id ?? forms?.pos[0]?.pos_id
  );
  return (
    <AntApp>
      <V3MeaningsAndExamplesStep
        activePosId={activePosId}
        draftRelationPrebindingEnabled={draftRelationPrebindingEnabled}
        forms={formsValue}
        idFactory={idFactory}
        issues={issues}
        onChange={setValue}
        onActivePosChange={setActivePosId}
        onFormsChange={(next) => {
          setFormsValue(next);
          setValue((current) =>
            ensureV3MeaningsForForms(wordId ?? "word-1", next, current, () =>
              crypto.randomUUID()
            )
          );
          onFormsChange?.(next);
        }}
        onSave={onSave}
        partOfSpeechCatalog={partOfSpeechCatalog}
        partOfSpeechCatalogError={partOfSpeechCatalogError}
        partOfSpeechCatalogPending={partOfSpeechCatalogPending}
        relationDisplaySnapshots={relationSnapshots}
        value={value}
        wordId={wordId}
      />
      <output data-testid="meanings-value">{JSON.stringify(value)}</output>
      <output data-testid="forms-value">{JSON.stringify(formsValue)}</output>
    </AntApp>
  );
}

function value(): DraftMeaningsStepContentWritableV3 {
  return JSON.parse(screen.getByTestId("meanings-value").textContent ?? "");
}

function formsValue(): DraftFormsStepContentV3 {
  return JSON.parse(screen.getByTestId("forms-value").textContent ?? "");
}

describe("V3MeaningsAndExamplesStep", () => {
  it("基本词性徽标按本地词义草稿实时递减且不产生字段错误", () => {
    const initial = structuredClone(meaningsFixture);
    delete initial.pos[0]!.senses[0]!.frequency;
    render(<Harness initial={initial} issues={[]} />);

    expect(screen.getByTitle("该词性未填项")).toHaveTextContent("1");
    fireEvent.change(screen.getByLabelText("释义 1 频率"), {
      target: { value: "50" }
    });
    expect(screen.getByTitle("该词性未填项")).toHaveAttribute(
      "data-show",
      "false"
    );
    expect(
      screen.getByLabelText("释义 1 频率").closest(".ant-input-number")
    ).not.toHaveClass("ant-input-number-status-error");
  });

  beforeEach(() => {
    relatedSearchAny.mockImplementation(defaultRelatedSearchImplementation);
  });

  it("短语在每条释义卡内渲染成分用词区块（多维释义与多维例句之间），单词不渲染", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "verb",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [
            {
              id: "form-base",
              form_type: "base",
              regional_variants: {
                mode: "common",
                common: {
                  id: "variant-common",
                  dialect: "common",
                  spelling: "give up",
                  origin: "manual",
                  pronunciations: []
                }
              }
            }
          ],
          form_groups: []
        }
      ]
    };
    const value = structuredClone(meaningsFixture);
    value.pos[0]!.senses[0]!.component_usages = [
      {
        state: "resolved",
        id: "usage-1",
        literal: "give",
        target_word_id: "entry-give",
        target_publication_id: "pub-give",
        target_pos_id: "pos-give",
        target_base_form_id: "base-give",
        target_sense_id: "sense-give-1",
        target_form_id: "form-give",
        target_variant_id: "variant-give",
        target_dialect: "common",
        target_form_type: "base",
        target_headword: "give",
        target_gloss: "给；交给"
      },
      // 拼写改动后落在 "give up" 之外的孤儿条目：保留在数据里，但点不到也删不掉，
      // 因此不能计进区块角标（否则数字与界面对不上）。
      {
        state: "unresolved",
        id: "usage-orphan",
        literal: "away"
      }
    ];
    const { container, rerender } = render(
      <AntApp>
        <V3MeaningsAndExamplesStep
          componentUsagesEnabled
          entryKind="phrase"
          forms={forms}
          onChange={vi.fn()}
          onFormsChange={vi.fn()}
          value={value}
        />
      </AntApp>
    );
    // 位置：多维释义 → 成分用词 → 多维例句 → 关联词
    const sectionTitles = Array.from(
      container.querySelectorAll(".word-sense-section-title")
    ).map((node) => node.textContent?.replace(/\s+/g, "") ?? "");
    expect(sectionTitles.join("|")).toMatch(
      /多维释义.*\|成分用词.*\|多维例句.*\|关联词/
    );
    const section = container.querySelector(
      '[data-v3-field="component_usages"]'
    );
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute(
      "data-v3-node-id",
      value.pos[0]!.senses[0]!.id
    );
    // 能力开启时与其他区块一致：默认展开
    expect(section!.querySelector(".word-sense-section-title")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    // 计数只算当前拼写里点得到的成分（孤儿 "away" 不计）；已关联的单词回显为按下态
    expect(section!.textContent).toContain("1 条");
    expect(section!.textContent).not.toContain("2 条");
    expect(
      screen.getByRole("button", { name: "关联第 1 个词 give" })
    ).toHaveAttribute("aria-pressed", "true");
    rerender(
      <AntApp>
        <V3MeaningsAndExamplesStep
          entryKind="word"
          forms={forms}
          onChange={vi.fn()}
          onFormsChange={vi.fn()}
          value={structuredClone(meaningsFixture)}
        />
      </AntApp>
    );
    expect(screen.queryByText("成分用词")).toBeNull();
  });

  it("后端未声明释义级成分能力时区块只读，单词按钮禁用", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "verb",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [
            {
              id: "form-base",
              form_type: "base",
              regional_variants: {
                mode: "common",
                common: {
                  id: "variant-common",
                  dialect: "common",
                  spelling: "give up",
                  origin: "manual",
                  pronunciations: []
                }
              }
            }
          ],
          form_groups: []
        }
      ]
    };
    const { container } = render(
      <AntApp>
        <V3MeaningsAndExamplesStep
          entryKind="phrase"
          forms={forms}
          onChange={vi.fn()}
          onFormsChange={vi.fn()}
          value={structuredClone(meaningsFixture)}
        />
      </AntApp>
    );
    const section = container.querySelector(
      '[data-v3-field="component_usages"]'
    )!;
    const title = section.querySelector(".word-sense-section-title")!;
    // 整块不可编辑时默认折叠：每条释义都摊开一条同样的只读提示只会挤占版面
    expect(title).toHaveAttribute("aria-expanded", "false");
    expect(section.querySelector(".word-sense-section-body")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    // 折叠是默认值而非已写入的状态，第一次点击必须就能展开（不能是空操作）
    fireEvent.click(title);
    expect(title).toHaveAttribute("aria-expanded", "true");
    expect(section.querySelector(".word-sense-section-body")).toHaveAttribute(
      "aria-hidden",
      "false"
    );
    // 展开后仍是只读，并说明原因
    expect(
      screen.getByText(/当前后端尚不支持释义级成分用词/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "关联第 1 个词 give" })
    ).toBeDisabled();
  });
  it("Step 3 仅列出未添加词性，并复用 forms 创建规则后切换到新 POS", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const catalog: PartOfSpeechCatalogResponse = {
      catalog_version: 1,
      items: [
        {
          id: "catalog-noun",
          code: "noun",
          name_zh: "名词",
          name_en: "Noun",
          abbreviation: "n.",
          sort_order: 1,
          allowed_form_types: [],
          default_form_types: [],
          sub_parts: []
        },
        {
          id: "catalog-verb",
          code: "verb",
          name_zh: "动词",
          name_en: "Verb",
          abbreviation: "v.",
          sort_order: 2,
          allowed_form_types: [],
          default_form_types: [],
          sub_parts: []
        }
      ]
    };
    const ids = Array.from({ length: 6 }, (_, index) =>
      uuidFromInt(8_000 + index)
    );
    const onFormsChange = vi.fn();
    render(
      <Harness
        forms={forms}
        idFactory={uuidSequence(...ids)}
        onFormsChange={onFormsChange}
        partOfSpeechCatalog={catalog}
      />
    );

    fireEvent.mouseDown(screen.getByLabelText("添加基本词性"));
    const choices = [
      ...document.querySelectorAll<HTMLElement>(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
      )
    ];
    expect(choices.map((item) => item.textContent)).toEqual(["动词"]);
    fireEvent.click(choices[0]!);

    const nextForms = JSON.parse(
      screen.getByTestId("forms-value").textContent ?? ""
    ) as DraftFormsStepContentV3;
    expect(nextForms.pos.map((item) => item.pos)).toEqual(["noun", "verb"]);
    expect(nextForms.pos[1]).toMatchObject({
      pos_id: ids[0],
      pos: "verb",
      forms: [{ id: ids[2], form_type: "base" }],
      form_groups: [{ id: ids[1], members: [{ id: ids[4], form_id: ids[2] }] }]
    });
    expect(onFormsChange).toHaveBeenCalledWith(nextForms);
    expect(screen.getByRole("tab", { name: /^动词/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("Step 3 词性目录加载或失败时禁用新增，并显示与 Step 2 一致的错误", () => {
    const { rerender } = render(
      <Harness
        forms={{ pos: [] }}
        partOfSpeechCatalogPending
        partOfSpeechCatalog={{ catalog_version: 1, items: [] }}
      />
    );
    expect(screen.getByLabelText("添加基本词性")).toBeDisabled();

    rerender(
      <Harness
        forms={{ pos: [] }}
        partOfSpeechCatalogError
        partOfSpeechCatalog={{ catalog_version: 1, items: [] }}
      />
    );
    expect(screen.getByText("词性目录不可用，已停止新增结构")).toBeVisible();
    expect(screen.getByLabelText("添加基本词性")).toBeDisabled();
  });

  it("在词义步骤从基本词性标签确认删除时，同步移除该词性内容与本词条内失效关联", async () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        },
        {
          pos_id: "pos-2",
          pos: "verb",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    const verb = structuredClone(initial.pos[0]!);
    verb.pos_id = "pos-2";
    verb.grammar_structures[0]!.id = "grammar-2";
    verb.grammar_structures[0]!.variants[0]!.id = "grammar-variant-2";
    verb.senses[0]!.id = "sense-2";
    verb.senses[0]!.sense_group_id = "sense-group-2";
    verb.senses[0]!.relations = [
      {
        id: "relation-to-removed-sense",
        relation: "synonym",
        target_word_id: "entry-1",
        target_sense_id: "sense-1",
        score: "0.8"
      }
    ];
    initial.sense_groups.push({
      id: "sense-group-2",
      name_zh: "动作",
      name_en: "Action"
    });
    initial.pos.push(verb);

    render(<Harness forms={forms} initial={initial} wordId="entry-1" />);
    const removePos = screen.getByLabelText("删除名词");
    expect(removePos).toHaveClass(
      "ant-btn-text",
      "ant-btn-sm",
      "ant-btn-dangerous"
    );
    expect(removePos.querySelector(".anticon-minus-circle")).not.toBeNull();
    expect(removePos.querySelector(".anticon-delete")).toBeNull();
    fireEvent.click(removePos);
    fireEvent.click(await screen.findByRole("button", { name: /^删\s*除$/ }));

    expect(formsValue().pos.map((pos) => pos.pos_id)).toEqual(["pos-2"]);
    expect(value().pos.map((pos) => pos.pos_id)).toEqual(["pos-2"]);
    expect(value().sense_groups.map((group) => group.id)).toEqual([
      "sense-group-1",
      "sense-group-2"
    ]);
    expect(value().pos[0]!.senses[0]!.relations).toEqual([]);
    expect(
      value().pos[0]!.senses[0]!.sentences.flatMap((sentence) => sentence.links)
    ).not.toContainEqual(expect.objectContaining({ sense_id: "sense-1" }));
  });

  it("词义步骤仅有一个基本词性时不提供删除入口", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    render(<Harness forms={forms} wordId="entry-1" />);
    expect(screen.queryByLabelText("删除名词")).toBeNull();
  });

  it("原生默认模板直接可编辑，并继续支持新增各类词义节点", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    let initialId = 0;
    const initial = ensureV3MeaningsForForms(
      "entry-new",
      forms,
      { sense_groups: [], pos: [] },
      () => `initial-${++initialId}`
    );
    const ids = [
      "grammar-new",
      "grammar-variant-new",
      "definition-new",
      "definition-content-new",
      "relation-new",
      "sense-new"
    ];
    render(
      <Harness
        forms={forms}
        idFactory={() => ids.shift()!}
        initial={initial}
        wordId="entry-new"
      />
    );

    const clickButton = (label: string) => {
      const button = screen.getByText(label).closest("button");
      expect(button).not.toBeNull();
      fireEvent.click(button!);
    };
    expect(value().sense_groups).toHaveLength(1);
    expect(value().pos[0]!.grammar_structures).toHaveLength(1);
    expect(value().pos[0]!.senses[0]!.definitions).toHaveLength(1);
    expect(value().pos[0]!.senses[0]!.sentences).toHaveLength(1);
    expect(value().pos[0]!.senses[0]!.relations).toEqual([]);
    expect(screen.queryByText(/暂无语义区间/u)).toBeNull();
    expect(screen.queryByText("当前词性还没有词义内容")).toBeNull();
    expect(screen.queryByRole("button", { name: "开始录入词义" })).toBeNull();
    expect(
      screen.getByText(
        "录入顺序：词义 → 语法结构 → 例句。系统报错触发条件：1) 某项词义缺本语言释义语句；2) 例句未配置关联单词；"
      )
    ).toBeVisible();
    expect(
      document.querySelector(".word-sense-editor .anticon-caret-up")
    ).not.toBeNull();

    clickButton("添加语法结构");
    clickButton("添加释义");
    clickButton("添加近义词");
    clickButton("添加词义");

    const result = value().pos[0]!;
    expect(result.grammar_structures[1]).toMatchObject({
      id: "grammar-new",
      variants: [{ id: "grammar-variant-new", dialect: "common" }]
    });
    expect(result.senses[0]!.definitions[1]).toMatchObject({
      id: "definition-new",
      content_id: "definition-content-new"
    });
    expect(result.senses[0]!.relations).toEqual([
      expect.objectContaining({ id: "relation-new" })
    ]);
    expect(result.senses[1]).toMatchObject({ id: "sense-new", relations: [] });
  });

  it("页内新增例句并通过词义草稿保存等级和英中内容", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <Harness initial={meaningsFixture} onSave={onSave} wordId="entry-1" />
    );
    fireEvent.click(screen.getByText("添加例句"));
    expect(document.querySelector(".ant-drawer")).toBeNull();
    expect(screen.getByLabelText("例句 2 等级")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("例句 2 通用英文"), {
      target: { value: "We broke the ice." }
    });
    fireEvent.change(screen.getByLabelText("例句 2 中文"), {
      target: { value: "我们打破了沉默。" }
    });
    fireEvent.mouseDown(screen.getByLabelText("例句 2 等级"));
    const choice = [
      ...document.querySelectorAll<HTMLElement>(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
      )
    ].find((option) => option.textContent === "C1");
    expect(choice).toBeDefined();
    fireEvent.click(choice!);
    fireEvent.click(screen.getByText("保存草稿"));
    expect(onSave).toHaveBeenCalledWith(value(), "save");
    expect(value().pos[0]!.senses[0]!.sentences[1]).toMatchObject({
      level: "C1",
      en_text: {
        common: { origin: "manual", value: { text: "We broke the ice." } }
      },
      zh_text: { text: "我们打破了沉默。" },
      // 等级改到 C1 后，唯一那档（zh_text 别名）的 band 跟着走
      zh_translations: [
        { band: "c1_c2", content: { text: "我们打破了沉默。" } }
      ],
      links: [{ word_id: "entry-1", sense_id: "sense-1", role: "focus" }]
    });
  });

  it("直接编辑保留节点和关联，保存失败后仍保留输入", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("保存失败"));
    render(
      <Harness initial={meaningsFixture} onSave={onSave} wordId="entry-1" />
    );
    const original = structuredClone(value().pos[0]!.senses[0]!.sentences[0]!);
    fireEvent.change(screen.getByLabelText("例句 1 通用英文"), {
      target: { value: "The city center is quiet." }
    });
    fireEvent.change(screen.getByLabelText("例句 1 中文"), {
      target: { value: "市中心很安静。" }
    });
    fireEvent.click(screen.getByText("保存草稿"));
    await Promise.resolve();
    const edited = value().pos[0]!.senses[0]!.sentences[0]!;
    expect(edited.id).toBe(original.id);
    expect(edited.links).toEqual(original.links);
    expect(edited.zh_text_id).toBe(original.zh_text_id);
    expect(screen.getByLabelText("例句 1 通用英文")).toHaveValue(
      "The city center is quiet."
    );
    expect(screen.getByLabelText("例句 1 中文")).toHaveValue("市中心很安静。");
    expect(document.querySelector(".ant-drawer")).toBeNull();
    expect(onSave).toHaveBeenCalledWith(value(), "save");
  });

  it("删除最后一条例句后显示空状态并保留添加入口", () => {
    render(<Harness initial={meaningsFixture} wordId="entry-1" />);

    fireEvent.click(screen.getByLabelText("删除例句 1"));

    expect(value().pos[0]!.senses[0]!.sentences).toEqual([]);
    expect(screen.getByText("暂无多维例句")).toBeVisible();
    expect(screen.getByText("添加例句").closest("button")).toBeVisible();
  });

  it("语法结构挂上语音编辑器，标注实时回写且不丢正文", async () => {
    // 这是 V3 唯一可编辑的语音文本入口；编辑器早先只接在 v2 向导上，
    // 而线上走的是 V3，等于现网够不着。
    render(<Harness initial={meaningsFixture} />);

    // 等的是按需加载的编辑器分块，给足超时：默认 1 秒在负载高的 CI runner 上不够
    const editor = await screen.findByRole(
      "toolbar",
      { name: "标注工具栏" },
      { timeout: 10_000 }
    );
    expect(editor).toBeInTheDocument();

    const input = screen.getByLabelText("语法结构 1 通用内容");
    // 错误定位靠 focus() + activeElement 校验，属性必须落在输入框本身
    expect(input).toHaveAttribute("data-v3-field", "content");
    expect(input.tagName).toBe("TEXTAREA");

    fireEvent.change(input, { target: { value: "a centre of the city" } });
    expect(
      value().pos[0]!.grammar_structures[0]!.variants[0]!.content.text
    ).toBe("a centre of the city");

    // 取语法结构画笔标一个词，标注应实时落到草稿里
    fireEvent.click(document.querySelector(".tsz-ve-role-button")!);
    fireEvent.click(screen.getByLabelText("用核心词画笔"));
    const word = [...document.querySelectorAll(".tsz-ve-token")].find(
      (node) => node.textContent === "centre"
    )!;
    fireEvent.mouseDown(word);

    const content = value().pos[0]!.grammar_structures[0]!.variants[0]!.content;
    expect(content.text).toBe("a centre of the city");
    expect(content.version).toBe(2);
    expect(content.version === 2 ? content.annotations : []).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "core" }
    ]);
  }, 15_000);

  it("音色与语速落到语法结构变体的 voice_profile 上", async () => {
    render(<Harness initial={meaningsFixture} />);
    await screen.findByRole(
      "toolbar",
      { name: "标注工具栏" },
      { timeout: 10_000 }
    );

    const variant = () => value().pos[0]!.grammar_structures[0]!.variants[0]!;
    // 没动过之前不该凭空写出一份配置
    expect(variant().voice_profile).toBeUndefined();

    fireEvent.click(screen.getByLabelText("语速"));
    fireEvent.click(screen.getByLabelText("语速 1.25 倍"));

    expect(variant().voice_profile).toEqual({
      voice_ids: expect.any(Array),
      rate_percent: 25
    });
  }, 15_000);

  it("语法结构复用 V2 单栏文本区且不显示地区下拉", () => {
    const { container } = render(<Harness initial={meaningsFixture} />);

    const grammarPanel = container.querySelector(".word-grammar-panel");
    expect(grammarPanel).not.toBeNull();
    expect(
      within(grammarPanel as HTMLElement).queryByLabelText("语法结构 1 地区 1")
    ).toBeNull();
    const content = within(grammarPanel as HTMLElement).getByLabelText(
      "语法结构 1 通用内容"
    );
    expect(content.tagName).toBe("TEXTAREA");
    expect(content).toHaveAttribute(
      "placeholder",
      "例如 a centre / the centre"
    );
    expect(meaningsCss).toMatch(
      /\.word-grammar-panel\s+\.word-pronunciation-phonetic-input\s*\{[^}]*width:\s*100%;/su
    );
    expect(v3LayoutCss).toMatch(
      /\.v3-meanings-v2\s+\.word-grammar-panel\s*\{[^}]*display:\s*block;/su
    );
    expect(v3LayoutCss).not.toMatch(
      /\.v3-meanings-v2\s+\.word-grammar-panel\s*\{[^}]*grid-template-columns:\s*104px/su
    );
    const addGrammar = within(
      container.querySelector(".word-grammar-card") as HTMLElement
    ).getByRole("button", { name: "添加语法结构" });
    expect(addGrammar.closest(".ant-card-extra")).not.toBeNull();
    expect(addGrammar).toHaveClass("ant-btn-text");
    expect(container.querySelector(".word-grammar-add")).toBeNull();
  });

  it("区分英美式词性的语法结构提供英式美式双栏，新增也按方言建双条", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.grammar_structures[0]!.variants = [
      {
        id: "grammar-variant-uk",
        dialect: "uk",
        content: { version: 2, text: "a centre", annotations: [] }
      },
      {
        id: "grammar-variant-us",
        dialect: "us",
        content: { version: 2, text: "a center", annotations: [] }
      }
    ];
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "distinguish",
            phonetic_mode: "distinguish"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const ids = [
      "grammar-new",
      "grammar-variant-new-uk",
      "grammar-variant-new-us"
    ];
    render(
      <Harness
        forms={forms}
        idFactory={() => ids.shift()!}
        initial={initial}
        wordId="entry-1"
      />
    );

    const uk = screen.getByLabelText("语法结构 1 英式内容");
    const us = screen.getByLabelText("语法结构 1 美式内容");
    expect(uk).toHaveValue("a centre");
    expect(us).toHaveValue("a center");
    expect(uk).toHaveAttribute("placeholder", "例如 a centre / the centre");
    expect(us).toHaveAttribute("placeholder", "例如 a center / the center");
    expect(screen.getByText("英式")).toBeVisible();
    expect(screen.getByText("美式")).toBeVisible();

    fireEvent.change(us, { target: { value: "the center" } });
    expect(value().pos[0]!.grammar_structures[0]!.variants[1]).toMatchObject({
      dialect: "us",
      content: { text: "the center" }
    });

    fireEvent.click(screen.getByRole("button", { name: "添加语法结构" }));
    const structures = value().pos[0]!.grammar_structures;
    expect(structures).toHaveLength(2);
    expect(structures[1]!.variants.map((variant) => variant.dialect)).toEqual([
      "uk",
      "us"
    ]);
  });

  it("没写内容的语法结构不进下拉，未被选中时下拉为空并说明去哪填", () => {
    const dropdownOptions = () =>
      [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ].map((option) => option.textContent);

    // 填了内容：序号对齐上方卡片编号，后面跟内容预览
    const { unmount } = render(<Harness />);
    fireEvent.mouseDown(screen.getByLabelText("定义 1 语法结构"));
    expect(dropdownOptions()).toEqual(["① used as a noun"]);
    unmount();

    // 新建词性默认带的空结构：没被选中就不该出现在下拉里
    const blank = structuredClone(meaningsFixture);
    blank.pos[0]!.grammar_structures[0]!.variants[0]!.content.text = "   ";
    delete blank.pos[0]!.senses[0]!.definitions[0]!.grammar_structure_id;
    render(<Harness initial={blank} />);
    fireEvent.mouseDown(screen.getByLabelText("定义 1 语法结构"));
    expect(dropdownOptions()).toEqual([]);
    expect(screen.getByText("请先在上方填写语法结构")).toBeInTheDocument();
  });

  it("空的语法结构一旦被选中仍保留在下拉里，避免选中值显示成空白", () => {
    // fixture 的定义绑着 grammar-1；把它清空后这条仍要可见，否则 Select 显示空白
    const blank = structuredClone(meaningsFixture);
    blank.pos[0]!.grammar_structures[0]!.variants[0]!.content.text = "";
    render(<Harness initial={blank} />);

    fireEvent.mouseDown(screen.getByLabelText("定义 1 语法结构"));
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ].map((option) => option.textContent)
    ).toEqual(["① "]);
  });

  it("过长的语法结构预览截断到 24 字并留省略号", () => {
    const long = structuredClone(meaningsFixture);
    long.pos[0]!.grammar_structures[0]!.variants[0]!.content.text = "a".repeat(
      25
    );
    render(<Harness initial={long} />);

    fireEvent.mouseDown(screen.getByLabelText("定义 1 语法结构"));
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ].map((option) => option.textContent)
    ).toEqual([`① ${"a".repeat(24)}…`]);
  });

  it("语法结构保持必填，但仅在发布校验返回对应 issue 后显示红色", () => {
    const initial = structuredClone(meaningsFixture);
    delete initial.pos[0]!.senses[0]!.definitions[0]!.grammar_structure_id;
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "meanings",
      node_id: "definition-1",
      field: "grammar_structure_id",
      code: "definition_invalid",
      message: "请选择语法结构",
      node_location: {
        node_role: "meanings.definition",
        ancestor_node_ids: ["pos-1", "sense-1"],
        pos_id: "pos-1"
      }
    };
    const { container, rerender } = render(<Harness initial={initial} />);

    const header = container.querySelector(
      ".word-definition-list-header"
    ) as HTMLElement;
    expect([...header.children].map((item) => item.textContent)).toEqual([
      "",
      "等级",
      "释义语言及方式",
      "释义语句",
      "语法结构",
      ""
    ]);
    const row = container.querySelector(".word-definition-row") as HTMLElement;
    expect(row).not.toBeNull();
    const columns = [...row.children] as HTMLElement[];
    expect(columns).toHaveLength(6);
    const level = columns[1]!;
    const mode = columns[2]!;
    const body = columns[3]!;
    const grammarCell = columns[4]!;
    const actions = columns[5]!;
    expect(columns[0]).toHaveClass("word-number-cell");
    expect(columns[0]).not.toHaveClass("word-definition-index");
    expect(within(level).getByLabelText("定义 1 等级")).toBeVisible();
    expect(within(mode).getByLabelText("定义 1 方式")).toBeVisible();
    const content = within(body).getByLabelText("定义 1 内容");
    const grammar = within(grammarCell).getByLabelText("定义 1 语法结构");
    expect(content.tagName).toBe("TEXTAREA");
    expect(grammar).toHaveAttribute("aria-required", "true");
    expect(grammar.closest(".ant-select")).not.toHaveClass(
      "ant-select-status-error"
    );

    rerender(<Harness initial={initial} issues={[issue]} />);
    expect(
      screen.getByLabelText("定义 1 语法结构").closest(".ant-select")
    ).toHaveClass("ant-select-status-error");
    expect(screen.getByText("请完整填写释义并选择语法结构")).toBeVisible();
    expect(actions).toHaveClass("word-sort-actions", "ant-space-horizontal");
    expect(v3LayoutCss).toMatch(
      /\.v3-meanings-v2 \.word-sense-section\s*\{[^}]*--word-ops-col:\s*56px;/u
    );
    expect(v3LayoutCss).toMatch(
      /\.v3-meanings-v2 \.word-definition-row > \.word-sort-actions,\s*\.v3-meanings-v2 \.word-sentence-row > \.word-sort-actions\s*\{[^}]*min-height:\s*32px;/u
    );
    expect(v3LayoutCss).toMatch(
      /\.v3-meanings-v2 \.word-definition-row \.word-number-cell,\s*\.v3-meanings-v2 \.word-sentence-row \.word-number-cell\s*\{[^}]*line-height:\s*32px;/u
    );
    expect(meaningsCss).toContain(".word-table-row.word-definition-row {");
  });

  it("仅在传入发布问题后把词频和必选项映射到字段，输入时不主动清除", () => {
    const issues: V3DraftValidationIssue[] = [
      {
        schema_version: 3,
        step: "meanings",
        node_id: "sense-1",
        field: "sub_pos",
        code: "sub_pos_required",
        message: "请选择细分词性",
        node_location: {
          node_role: "meanings.sense",
          ancestor_node_ids: ["pos-1"],
          pos_id: "pos-1"
        }
      },
      {
        schema_version: 3,
        step: "meanings",
        node_id: "sense-1",
        field: "frequency",
        code: "frequency_invalid",
        message: "词义词频必须是 0–100 且最多两位小数",
        node_location: {
          node_role: "meanings.sense",
          ancestor_node_ids: ["pos-1"],
          pos_id: "pos-1"
        }
      }
    ];
    const view = render(<Harness initial={meaningsFixture} />);

    expect(
      screen.getByLabelText("释义 1 子词性").closest(".ant-select")
    ).not.toHaveClass("ant-select-status-error");
    expect(
      screen.getByLabelText("释义 1 频率").closest(".ant-input-number")
    ).not.toHaveClass("ant-input-number-status-error");

    view.rerender(<Harness initial={meaningsFixture} issues={issues} />);
    expect(
      screen.getByLabelText("释义 1 子词性").closest(".ant-select")
    ).toHaveClass("ant-select-status-error");
    expect(
      screen.getByLabelText("释义 1 频率").closest(".ant-input-number")
    ).toHaveClass("ant-input-number-status-error");
    expect(screen.getByText("请选择细分词性")).toBeVisible();
    expect(
      screen.getByText("词频必须为 0–100，且最多保留两位小数")
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("释义 1 频率"), {
      target: { value: "25" }
    });
    expect(
      screen.getByText("词频必须为 0–100，且最多保留两位小数")
    ).toBeVisible();

    view.rerender(<Harness initial={meaningsFixture} issues={[]} />);
    expect(
      screen.queryByText("词频必须为 0–100，且最多保留两位小数")
    ).toBeNull();
  });

  it("多维例句表头与等级、英中内容和操作列对齐", () => {
    const { container } = render(<Harness initial={meaningsFixture} />);
    const header = container.querySelector(
      ".word-sentence-list-header"
    ) as HTMLElement;
    expect([...header.children].map((item) => item.textContent)).toEqual([
      "",
      "等级",
      "英文例句",
      "汉语译文",
      ""
    ]);
    const row = container.querySelector(".word-sentence-row") as HTMLElement;
    expect(
      [...row.children].filter((child) => !child.hasAttribute("hidden"))
    ).toHaveLength(5);
    expect(row.children[0]).toHaveClass("word-number-cell");
    expect(row.children[0]).not.toHaveClass("word-sentence-index");
    expect(screen.getByLabelText("例句 1 等级")).not.toBeDisabled();
    expect(screen.getByLabelText("例句 1 通用英文")).not.toHaveAttribute(
      "readonly"
    );
    expect(screen.getByLabelText("例句 1 中文")).not.toHaveAttribute(
      "readonly"
    );
    expect(row.querySelectorAll(".anticon-sound")).toHaveLength(1);
    expect(screen.getByLabelText("高阶译文")).toHaveTextContent("高");
    expect(meaningsCss).toContain(".word-table-row.word-sentence-row {");
  });

  it("行内改例句等级：仅有的 zh_text 别名译文档位跟着走，多档译文不动", () => {
    const single = structuredClone(meaningsFixture);
    const sentence = single.pos[0]!.senses[0]!.sentences[0]!;
    sentence.level = "A1";
    sentence.zh_translations = [
      {
        id: sentence.zh_text_id,
        band: "a1_a2",
        content: { version: 2, text: "高阶译文", annotations: [] }
      }
    ];
    const { unmount } = render(<Harness initial={single} />);
    fireEvent.mouseDown(screen.getByLabelText("例句 1 等级"));
    fireEvent.click(screen.getAllByText("C1").at(-1)!);
    expect(value().pos[0]!.senses[0]!.sentences[0]).toMatchObject({
      level: "C1",
      zh_translations: [
        expect.objectContaining({ id: sentence.zh_text_id, band: "c1_c2" })
      ]
    });
    unmount();

    const multi = structuredClone(meaningsFixture);
    const target = multi.pos[0]!.senses[0]!.sentences[0]!;
    target.level = "A1";
    target.zh_translations = [
      {
        id: "translation-a",
        band: "a1_a2",
        content: { version: 2, text: "高", annotations: [] }
      },
      {
        id: "translation-b",
        band: "b1_b2",
        content: { version: 2, text: "中", annotations: [] }
      }
    ];
    render(<Harness initial={multi} />);
    fireEvent.mouseDown(screen.getByLabelText("例句 1 等级"));
    fireEvent.click(screen.getAllByText("C1").at(-1)!);
    const after = value().pos[0]!.senses[0]!.sentences[0]!;
    expect(after.level).toBe("C1");
    expect(after.zh_translations!.map((item) => item.band)).toEqual([
      "a1_a2",
      "b1_b2"
    ]);
  });

  it("页内编辑一档译文时保留其他译文和 ID", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.sentences[0]!.zh_translations = [
      {
        id: "translation-c",
        band: "c1_c2",
        content: { version: 2, text: "初阶译文", annotations: [] }
      },
      {
        id: "translation-b",
        band: "b1_b2",
        content: { version: 2, text: "中阶译文", annotations: [] }
      },
      {
        id: "translation-a",
        band: "a1_a2",
        content: { version: 2, text: "高阶译文", annotations: [] }
      }
    ];
    render(<Harness initial={initial} wordId="entry-1" />);

    expect(screen.getByLabelText("例句 1 初阶中文")).toHaveValue("初阶译文");
    expect(screen.getByLabelText("例句 1 中阶中文")).toHaveValue("中阶译文");
    expect(screen.getByLabelText("例句 1 高阶中文")).toHaveValue("高阶译文");
    expect(screen.getByLabelText("初阶译文")).toHaveTextContent("初");
    expect(screen.getByLabelText("中阶译文")).toHaveTextContent("中");
    expect(screen.getByLabelText("高阶译文")).toHaveTextContent("高");
    fireEvent.change(screen.getByLabelText("例句 1 中阶中文"), {
      target: { value: "更新中阶译文" }
    });
    const translations =
      value().pos[0]!.senses[0]!.sentences[0]!.zh_translations;
    expect(translations[0]).toEqual(
      initial.pos[0]!.senses[0]!.sentences[0]!.zh_translations[0]
    );
    expect(translations[1]).toMatchObject({
      id: "translation-b",
      content: { text: "更新中阶译文" }
    });
    expect(translations[2]).toEqual(
      initial.pos[0]!.senses[0]!.sentences[0]!.zh_translations[2]
    );
  });

  it("多维释义、多维例句与关联词可独立收起展开且不修改草稿", () => {
    const { container } = render(<Harness initial={meaningsFixture} />);
    const initial = value();
    const definitions = container.querySelector(
      '[data-v3-field="definitions"]'
    ) as HTMLElement;
    const sentences = screen.getByText("多维例句").closest("section")!;
    const relations = screen.getByText("关联词").closest("section")!;
    const sectionButton = (section: HTMLElement, label: string) =>
      section.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`
      )!;
    const sectionTitle = (section: HTMLElement, label: string) =>
      within(section).getByRole("button", { name: `切换${label}` });
    const sectionBody = (section: HTMLElement) =>
      section.querySelector<HTMLElement>(".word-sense-section-body")!;

    const definitionsTitle = sectionTitle(definitions, "多维释义");
    expect(definitionsTitle).toHaveClass("is-interactive");
    expect(definitionsTitle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(definitionsTitle);
    expect(definitions).toHaveClass("is-collapsed");
    expect(sectionBody(definitions)).toHaveClass("is-collapsed");
    expect(sectionBody(definitions)).toHaveAttribute("aria-hidden", "true");
    expect(within(sentences).getByLabelText("例句 1 通用英文")).toBeVisible();
    expect(
      sectionButton(definitions, "展开多维释义").querySelector(
        ".anticon-caret-down"
      )
    ).not.toBeNull();

    fireEvent.keyDown(definitionsTitle, { key: "Enter" });
    expect(sectionBody(definitions)).not.toHaveClass("is-collapsed");
    expect(sectionBody(definitions)).toHaveAttribute("aria-hidden", "false");
    expect(within(definitions).getByLabelText("定义 1 内容")).toBeVisible();

    const sentencesTitle = sectionTitle(sentences, "多维例句");
    fireEvent.click(sentencesTitle);
    expect(sentences).toHaveClass("is-collapsed");
    expect(sectionBody(sentences)).toHaveClass("is-collapsed");
    expect(sectionBody(sentences)).toHaveAttribute("aria-hidden", "true");
    expect(within(definitions).getByLabelText("定义 1 内容")).toBeVisible();
    fireEvent.keyDown(sentencesTitle, { key: " " });
    expect(sectionBody(sentences)).not.toHaveClass("is-collapsed");
    expect(within(sentences).getByLabelText("例句 1 通用英文")).toBeVisible();

    const relationsTitle = sectionTitle(relations, "关联词");
    fireEvent.click(relationsTitle);
    expect(relations).toHaveClass("is-collapsed");
    expect(sectionBody(relations)).toHaveClass("is-collapsed");
    expect(sectionBody(relations)).toHaveAttribute("aria-hidden", "true");
    expect(
      sectionButton(relations, "展开关联词").querySelector(
        ".anticon-caret-down"
      )
    ).not.toBeNull();
    fireEvent.click(sectionButton(relations, "展开关联词"));
    expect(relations).not.toHaveClass("is-collapsed");
    expect(sectionBody(relations)).not.toHaveClass("is-collapsed");
    expect(relations.querySelector(".word-relations-grid")).not.toBeNull();
    expect(sectionButton(relations, "收起关联词")).toBeVisible();
    fireEvent.keyDown(relationsTitle, { key: " " });
    expect(relations).toHaveClass("is-collapsed");
    fireEvent.keyDown(relationsTitle, { key: "Enter" });
    expect(relations).not.toHaveClass("is-collapsed");
    expect(within(definitions).getByLabelText("定义 1 内容")).toBeVisible();
    expect(meaningsCss).toContain(
      ".word-sense-section-title.is-interactive:hover"
    );
    expect(meaningsCss).toContain(
      ".word-sense-section-title.is-interactive:focus-visible"
    );
    expect(meaningsCss).toContain("grid-template-rows 220ms ease");
    expect(value()).toEqual(initial);
  });

  it("关联词三类卡片在新增前后保持固定顺序", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    const { container } = render(<Harness initial={initial} />);
    const grid = container.querySelector(".word-relations-grid") as HTMLElement;
    const titles = () =>
      [
        ...grid.querySelectorAll(
          ":scope > .word-relation-card > .ant-card-head .ant-card-head-title"
        )
      ].map((title) => title.textContent);

    expect(titles()).toEqual(["近义词", "反义词", "派生词"]);
    fireEvent.click(within(grid).getByText("添加近义词").closest("button")!);
    expect(titles()).toEqual(["近义词", "反义词", "派生词"]);
    expect(grid.querySelectorAll(":scope > .word-relation-card")).toHaveLength(
      3
    );

    const synonymCard = grid.querySelector(
      ":scope > .word-relation-card"
    ) as HTMLElement;
    expect(within(synonymCard).queryByLabelText("关联 1 类型")).toBeNull();
    fireEvent.click(
      within(synonymCard).getByText("添加近义词").closest("button")!
    );
    expect(titles()).toEqual(["近义词", "反义词", "派生词"]);
    expect(synonymCard.querySelectorAll(".word-relation-row")).toHaveLength(2);
  });

  it("关联词复用 V2 完整搜索、匹配词义、待建条与折叠交互", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    const { container } = render(<Harness initial={initial} />);
    const grid = container.querySelector(".word-relations-grid") as HTMLElement;
    const synonymCard = grid.querySelector(
      ':scope > .word-relation-card[data-relation-type="synonym"]'
    ) as HTMLElement;

    fireEvent.click(
      within(synonymCard).getByText("添加近义词").closest("button")!
    );
    expect(within(synonymCard).getByText("相似度")).toBeVisible();
    expect(within(synonymCard).getByText("匹配词义")).toBeVisible();
    expect(within(synonymCard).queryByLabelText("关联 1 类型")).toBeNull();
    expect(
      within(synonymCard).getByLabelText("相似度").closest(".ant-input-number")
    ).not.toBeNull();

    const target = within(synonymCard).getByLabelText("近义词目标词条");
    fireEvent.change(target, { target: { value: "outside" } });
    const relationId = value().pos[0]!.senses[0]!.relations[0]!.id;
    const pendingGloss = within(synonymCard).getByLabelText("近义词预定义词义");
    expect(pendingGloss.tagName).toBe("INPUT");
    expect(pendingGloss).toHaveClass("word-relation-sense");
    expect(pendingGloss.closest(".word-relation-row")).toBe(
      target.closest(".word-relation-row")
    );
    expect(
      pendingGloss
        .closest(".word-relation-row")
        ?.querySelectorAll(".word-relation-sense")
    ).toHaveLength(1);
    expect(synonymCard.querySelector("textarea")).toBeNull();
    expect(within(synonymCard).queryByLabelText("近义词目标词义")).toBeNull();
    fireEvent.change(pendingGloss, {
      target: { value: "预先填写的中文释义" }
    });
    expect(value().pos[0]!.senses[0]!.relations[0]).toMatchObject({
      id: relationId,
      pending_target_gloss: "预先填写的中文释义"
    });
    expect(relatedSearchAny).toHaveBeenCalledWith(
      "outside",
      "word",
      true,
      true
    );
    fireEvent.click(screen.getAllByText("outside").at(-1)!);
    expect(value().pos[0]!.senses[0]!.relations[0]).toMatchObject({
      target_word_id: "external-word-1"
    });
    expect(value().pos[0]!.senses[0]!.relations[0]).not.toHaveProperty(
      "pending_target_headword"
    );
    expect(value().pos[0]!.senses[0]!.relations[0]).not.toHaveProperty(
      "pending_target_gloss"
    );
    expect(value().pos[0]!.senses[0]!.relations[0]!.id).toBe(relationId);

    fireEvent.mouseDown(within(synonymCard).getByLabelText("近义词目标词义"));
    fireEvent.click(screen.getAllByText("外部词义一").at(-1)!);
    expect(value().pos[0]!.senses[0]!.relations[0]).toMatchObject({
      target_word_id: "external-word-1",
      target_sense_id: "external-sense-1"
    });

    fireEvent.click(
      within(synonymCard).getByText("添加近义词").closest("button")!
    );
    fireEvent.change(
      within(synonymCard).getAllByLabelText("近义词目标词条").at(-1)!,
      { target: { value: "freshword" } }
    );
    expect(value().pos[0]!.senses[0]!.relations[1]).toMatchObject({
      pending_target_headword: "freshword"
    });
    fireEvent.click(
      within(synonymCard).getByText("添加近义词").closest("button")!
    );
    fireEvent.change(
      within(synonymCard).getAllByLabelText("近义词目标词条").at(-1)!,
      { target: { value: "newword" } }
    );
    expect(value().pos[0]!.senses[0]!.relations[2]).toMatchObject({
      pending_target_headword: "newword"
    });
    // 提示不再沉在卡片底部：两条待建条各自在输入框右侧挂一个图标，框体转黄
    const pendingIcons =
      within(synonymCard).getAllByLabelText("近义词待建条提示");
    expect(pendingIcons).toHaveLength(2);
    expect(
      within(synonymCard).queryByText(/发布时会自动匹配同名词条或建条/u)
    ).toBeNull();
    expect(
      within(synonymCard)
        .getAllByLabelText("近义词目标词条")
        .at(-1)!
        .closest(".ant-input-status-warning")
    ).not.toBeNull();

    const pendingTarget = within(synonymCard)
      .getAllByLabelText("近义词目标词条")
      .at(-1)!;
    fireEvent.change(pendingTarget, { target: { value: "苹果" } });
    expect(within(synonymCard).getByText(/仅支持英文词条/u)).toBeVisible();
    expect(relatedSearchAny).not.toHaveBeenCalledWith(
      "苹果",
      "word",
      true,
      true
    );
    expect(value().pos[0]!.senses[0]!.relations[2]).not.toHaveProperty(
      "pending_target_headword"
    );

    fireEvent.change(pendingTarget, { target: { value: "  give   up  " } });
    expect(relatedSearchAny).toHaveBeenCalledWith(
      "give up",
      "phrase",
      true,
      true
    );
    expect(value().pos[0]!.senses[0]!.relations[2]).toMatchObject({
      pending_target_headword: "give up"
    });

    fireEvent.click(within(synonymCard).getByText("收起").closest("button")!);
    expect(synonymCard).toHaveClass("is-collapsed");
    expect(synonymCard.querySelector(".anticon-caret-down")).not.toBeNull();
    expect(meaningsCss).toMatch(
      /\.word-relations-grid\s*\{[^}]*align-items:\s*start;/su
    );
  });

  it("零词义草稿写入隐藏稳定 ID，第三列仍只显示 pending gloss", () => {
    relatedSearchAny.mockImplementation(
      (
        _query: string,
        _kind: "word" | "phrase" | undefined,
        _open: boolean,
        _includeDrafts?: boolean
      ) =>
        ({
          exact: {
            data: {
              pages: [
                {
                  results: [
                    {
                      schema_version: 3 as const,
                      entry_id: "draft-target-entry",
                      kind: "word" as const,
                      status: "draft" as const,
                      presentation: {
                        label: "reliability",
                        matched_surfaces: ["reliability"],
                        strategy_version: "surface_summary_v1"
                      },
                      matches: [],
                      senses: []
                    }
                  ],
                  total: 1,
                  next_cursor: null
                }
              ]
            },
            isFetching: false,
            isError: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
            refetch: vi.fn()
          },
          contains: {
            data: { pages: [] },
            isFetching: false,
            isError: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
            refetch: vi.fn()
          }
        }) as never
    );
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    const { container } = render(<Harness initial={initial} />);
    fireEvent.click(screen.getByText("添加近义词").closest("button")!);
    fireEvent.change(screen.getByLabelText("近义词目标词条"), {
      target: { value: "reliability" }
    });
    fireEvent.click(screen.getAllByText("reliability").at(-1)!);

    const relation = value().pos[0]!.senses[0]!.relations[0]!;
    expect(relation).toMatchObject({
      prebound_target_word_id: "draft-target-entry"
    });
    expect(relation).not.toHaveProperty("pending_target_headword");
    expect(relation).not.toHaveProperty("target_word_id");
    expect(relation).not.toHaveProperty("target_sense_id");
    expect(screen.getByText("草稿 · 等待第一词义")).toBeVisible();
    expect(screen.getByLabelText("近义词预定义词义")).toBeVisible();
    expect(screen.queryByLabelText("近义词目标词义")).toBeNull();
    expect(
      container.querySelectorAll(".word-relation-row .word-relation-sense")
    ).toHaveLength(1);
    expect(relatedSearchAny).toHaveBeenCalledWith(
      "reliability",
      "word",
      true,
      true
    );
  });

  it("detached 与归档预绑定刷新后保留稳定身份并要求显式重选", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [
      {
        id: "detached-relation",
        relation: "synonym",
        prebound_target_word_id: "draft-target-entry",
        pending_target_gloss: "可靠性",
        score: "80"
      }
    ];
    render(
      <Harness
        initial={initial}
        relationSnapshots={{
          "detached-relation": {
            headword: "reliability",
            prebinding_state: "target_sense_deleted",
            target_status: "archived"
          }
        }}
      />
    );

    expect(screen.getByLabelText("近义词目标词条")).toHaveValue("reliability");
    expect(screen.getByText("已归档 · 原词义已删除")).toBeVisible();
    expect(screen.getByLabelText("近义词预定义词义")).toHaveValue("可靠性");
    expect(screen.queryByLabelText("近义词目标词义")).toBeNull();
    expect(value().pos[0]!.senses[0]!.relations[0]).toMatchObject({
      prebound_target_word_id: "draft-target-entry"
    });
    expect(value().pos[0]!.senses[0]!.relations[0]).not.toHaveProperty(
      "pending_target_headword"
    );
  });

  it("关联词搜索有后页时提供加载入口，未完成 exact 前不宣称无匹配", () => {
    const fetchExactNextPage = vi.fn().mockResolvedValue(undefined);
    relatedSearchAny.mockImplementation((query, kind, open) =>
      query === "laterexact"
        ? ({
            exact: {
              data: {
                pages: [{ results: [], total: 1, next_cursor: "exact-next" }]
              },
              isFetching: false,
              isError: false,
              hasNextPage: true,
              fetchNextPage: fetchExactNextPage,
              refetch: vi.fn()
            },
            contains: {
              data: {
                pages: [{ results: [], total: 0, next_cursor: null }]
              },
              isFetching: false,
              isError: false,
              hasNextPage: false,
              fetchNextPage: vi.fn(),
              refetch: vi.fn()
            }
          } as never)
        : defaultRelatedSearchImplementation(query, kind, open)
    );
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByText("添加近义词").closest("button")!);
    fireEvent.change(screen.getByLabelText("近义词目标词条"), {
      target: { value: "laterexact" }
    });

    expect(screen.queryByText("未找到匹配词条")).toBeNull();
    const loadMore = screen.getByLabelText("加载更多关联词结果");
    expect(loadMore).toBeVisible();
    fireEvent.click(loadMore);
    expect(fetchExactNextPage).toHaveBeenCalledTimes(1);
  });

  it("关联词搜索失败显示错误和重试，不伪装成未找到", () => {
    const retryExact = vi.fn().mockResolvedValue(undefined);
    relatedSearchAny.mockImplementation((query, kind, open) =>
      query === "networkfail"
        ? ({
            exact: {
              data: { pages: [] },
              isFetching: false,
              isError: true,
              hasNextPage: false,
              fetchNextPage: vi.fn(),
              refetch: retryExact
            },
            contains: {
              data: { pages: [] },
              isFetching: false,
              isError: false,
              hasNextPage: false,
              fetchNextPage: vi.fn(),
              refetch: vi.fn()
            }
          } as never)
        : defaultRelatedSearchImplementation(query, kind, open)
    );
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByText("添加近义词").closest("button")!);
    fireEvent.change(screen.getByLabelText("近义词目标词条"), {
      target: { value: "networkfail" }
    });

    expect(screen.queryByText("未找到匹配词条")).toBeNull();
    const retry = screen.getByLabelText("重试关联词搜索");
    expect(retry).toHaveTextContent("搜索失败，重试");
    fireEvent.click(retry);
    expect(retryExact).toHaveBeenCalledTimes(1);
  });

  it("exact 已完成但 contains 有后页时从 contains 加载更多", () => {
    const fetchExactNextPage = vi.fn().mockResolvedValue(undefined);
    const fetchContainsNextPage = vi.fn().mockResolvedValue(undefined);
    relatedSearchAny.mockImplementation((query, kind, open) =>
      query === "containsmore"
        ? ({
            exact: {
              data: { pages: [{ results: [], total: 0, next_cursor: null }] },
              isFetching: false,
              isError: false,
              hasNextPage: false,
              fetchNextPage: fetchExactNextPage,
              refetch: vi.fn()
            },
            contains: {
              data: {
                pages: [{ results: [], total: 1, next_cursor: "contains-next" }]
              },
              isFetching: false,
              isError: false,
              hasNextPage: true,
              fetchNextPage: fetchContainsNextPage,
              refetch: vi.fn()
            }
          } as never)
        : defaultRelatedSearchImplementation(query, kind, open)
    );
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByText("添加近义词").closest("button")!);
    fireEvent.change(screen.getByLabelText("近义词目标词条"), {
      target: { value: "containsmore" }
    });

    const loadMore = screen.getByLabelText("加载更多关联词结果");
    expect(fireEvent.mouseDown(loadMore)).toBe(false);
    fireEvent.click(loadMore);
    expect(fetchExactNextPage).not.toHaveBeenCalled();
    expect(fetchContainsNextPage).toHaveBeenCalledTimes(1);
  });

  it("仅 contains 搜索失败时只重试 contains", () => {
    const retryExact = vi.fn().mockResolvedValue(undefined);
    const retryContains = vi.fn().mockResolvedValue(undefined);
    relatedSearchAny.mockImplementation((query, kind, open) =>
      query === "containsfail"
        ? ({
            exact: {
              data: { pages: [] },
              isFetching: false,
              isError: false,
              hasNextPage: false,
              fetchNextPage: vi.fn(),
              refetch: retryExact
            },
            contains: {
              data: { pages: [] },
              isFetching: false,
              isError: true,
              hasNextPage: false,
              fetchNextPage: vi.fn(),
              refetch: retryContains
            }
          } as never)
        : defaultRelatedSearchImplementation(query, kind, open)
    );
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.relations = [];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByText("添加近义词").closest("button")!);
    fireEvent.change(screen.getByLabelText("近义词目标词条"), {
      target: { value: "containsfail" }
    });

    const retry = screen.getByLabelText("重试关联词搜索");
    expect(fireEvent.mouseDown(retry)).toBe(false);
    fireEvent.click(retry);
    expect(retryExact).not.toHaveBeenCalled();
    expect(retryContains).toHaveBeenCalledTimes(1);
  });

  it("canonical 已绑定关系进入 Step 3 时显示真实目标词面和词义快照", () => {
    const canonical = structuredClone(
      meaningsFixture
    ) as unknown as import("@tsz/types").DraftMeaningsStepContentV3;
    const relation = canonical.pos[0]!.senses[0]!.relations[0]!;
    relation.target_headword = "outside";
    relation.target_gloss = "外部词义一";
    const writable = toWritableMeanings(canonical);
    render(
      <Harness
        initial={writable}
        relationSnapshots={{
          [relation.id]: {
            headword: relation.target_headword,
            gloss: relation.target_gloss
          }
        }}
      />
    );

    expect(screen.getByLabelText("近义词目标词条")).toHaveValue("outside");
    expect(screen.getByText("外部词义一")).toBeVisible();
    expect(writable.pos[0]!.senses[0]!.relations[0]).not.toHaveProperty(
      "target_headword"
    );
    expect(writable.pos[0]!.senses[0]!.relations[0]).not.toHaveProperty(
      "target_gloss"
    );
  });

  it("关联编辑器隐藏时保留错误、重复和上下文 links 原样等待后续恢复", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.sentences[0]!.links = [
      { word_id: "wrong-word", sense_id: "wrong-sense", role: "focus" },
      { word_id: "entry-1", sense_id: "sense-1", role: "head" },
      {
        word_id: "existing-context-word",
        sense_id: "existing-context-sense",
        role: "context"
      }
    ];
    const { container } = render(
      <Harness initial={initial} wordId="entry-1" />
    );
    expect(
      container.querySelector(".word-sentence-associations")
    ).toHaveAttribute("hidden");
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual(
      initial.pos[0]!.senses[0]!.sentences[0]!.links
    );
  });

  it("关联编辑器隐藏时不自动改写历史 head 或 context 角色", () => {
    const headDraft = structuredClone(meaningsFixture);
    const { unmount } = render(
      <Harness initial={headDraft} wordId="entry-1" />
    );
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual(
      headDraft.pos[0]!.senses[0]!.sentences[0]!.links
    );
    unmount();

    const contextDraft = structuredClone(meaningsFixture);
    contextDraft.pos[0]!.senses[0]!.sentences[0]!.links = [
      { word_id: "entry-1", sense_id: "sense-1", role: "context" }
    ];
    render(<Harness initial={contextDraft} wordId="entry-1" />);
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual(
      contextDraft.pos[0]!.senses[0]!.sentences[0]!.links
    );
  });

  it("各 meanings 列表可重排并删除，删除释义组会解除 sense 引用", () => {
    const initial = structuredClone(meaningsFixture);
    initial.sense_groups.push({
      id: "sense-group-2",
      name_zh: "次要",
      name_en: "Secondary"
    });
    const pos = initial.pos[0]!;
    pos.grammar_structures.push({
      id: "grammar-2",
      variants: [
        {
          id: "grammar-variant-2",
          dialect: "common",
          content: { version: 2, text: "second grammar", annotations: [] }
        }
      ]
    });
    const sense = pos.senses[0]!;
    const definition = structuredClone(sense.definitions[0]!);
    definition.id = "definition-2";
    if (
      definition.definition_mode === "zh_definition" ||
      definition.definition_mode === "zh_sentence"
    ) {
      definition.content_id = "definition-content-2";
    }
    sense.definitions.push(definition);
    const sentence = structuredClone(sense.sentences[0]!);
    sentence.id = "sentence-2";
    sentence.zh_text_id = "sentence-zh-2";
    if (sentence.en_text.mode === "unified") {
      sentence.en_text.common.id = "sentence-en-2";
    }
    sense.sentences.push(sentence);
    sense.relations.push({
      id: "relation-2",
      relation: "antonym",
      score: "0.5"
    });
    pos.senses.push({
      id: "sense-2",
      sub_pos: "uncountable",
      level: "A2",
      depends_on_context: false,
      definitions: [],
      sentences: [],
      relations: []
    });
    const { container } = render(<Harness initial={initial} />);

    const clickAction = (name: string) => {
      const button = container.querySelector<HTMLButtonElement>(
        `button[aria-label="${name}"]`
      );
      expect(button).not.toBeNull();
      fireEvent.click(button!);
    };

    fireEvent.keyDown(screen.getByLabelText("拖动语义区间 1"), {
      key: "ArrowDown"
    });
    fireEvent.keyDown(screen.getByLabelText("拖动语法结构 1"), {
      key: "ArrowDown"
    });
    fireEvent.keyDown(screen.getByLabelText("拖动定义 1"), {
      key: "ArrowDown"
    });
    fireEvent.keyDown(screen.getByLabelText("拖动例句 1"), {
      key: "ArrowDown"
    });
    fireEvent.click(screen.getByRole("button", { name: "管理词义 1" }));
    fireEvent.click(screen.getByText("下移词义"));
    expect(value()).toMatchObject({
      sense_groups: [{ id: "sense-group-2" }, { id: "sense-group-1" }],
      pos: [
        {
          grammar_structures: [{ id: "grammar-2" }, { id: "grammar-1" }],
          senses: [{ id: "sense-2" }, { id: "sense-1" }]
        }
      ]
    });
    const movedSense = value().pos[0]!.senses[1]!;
    expect(movedSense.definitions.map((item) => item.id)).toEqual([
      "definition-2",
      "definition-1"
    ]);
    expect(movedSense.sentences.map((item) => item.id)).toEqual([
      "sentence-2",
      "sentence-1"
    ]);
    expect(movedSense.relations.map((item) => item.id)).toEqual([
      "relation-1",
      "relation-2"
    ]);

    for (const name of ["删除定义 2", "删除例句 2", "删除近义词"]) {
      clickAction(name);
    }
    const reducedSense = value().pos[0]!.senses[1]!;
    expect(reducedSense.definitions.map((item) => item.id)).toEqual([
      "definition-2"
    ]);
    expect(reducedSense.sentences.map((item) => item.id)).toEqual([
      "sentence-2"
    ]);
    expect(reducedSense.relations.map((item) => item.id)).toEqual([
      "relation-2"
    ]);

    clickAction("删除语义区间 2");
    expect(value().pos[0]!.senses[1]).not.toHaveProperty("sense_group_id");
    clickAction("删除语法结构 2");
    expect(value().pos[0]!.senses[1]!.definitions[0]).not.toHaveProperty(
      "grammar_structure_id"
    );
    fireEvent.click(screen.getByRole("button", { name: "管理词义 2" }));
    fireEvent.click(screen.getByText("删除词义"));
    expect(value().sense_groups.map((item) => item.id)).toEqual([
      "sense-group-2"
    ]);
    expect(value().pos[0]!.grammar_structures.map((item) => item.id)).toEqual([
      "grammar-2"
    ]);
    expect(value().pos[0]!.senses.map((item) => item.id)).toEqual(["sense-2"]);
  }, 15_000);

  it("语义区间和语法结构恢复可访问拖拽并保持全部 V3 身份与引用", () => {
    const initial = structuredClone(meaningsFixture);
    initial.sense_groups.push({
      id: "sense-group-2",
      name_zh: "次要",
      name_en: "Secondary"
    });
    initial.pos[0]!.grammar_structures.push({
      id: "grammar-2",
      variants: [
        {
          id: "grammar-variant-2",
          dialect: "common",
          content: { version: 2, text: "second grammar", annotations: [] }
        }
      ]
    });
    render(<Harness initial={initial} wordId="entry-drag" />);

    const originalIds = {
      groups: initial.sense_groups.map((group) => group.id).sort(),
      grammars: initial.pos[0]!.grammar_structures.map(
        (grammar) => grammar.id
      ).sort(),
      variants: initial.pos[0]!.grammar_structures.flatMap((grammar) =>
        grammar.variants.map((variant) => variant.id)
      ).sort(),
      sense: initial.pos[0]!.senses[0]!.id,
      definition: initial.pos[0]!.senses[0]!.definitions[0]!.id
    };

    expect(
      screen.getByLabelText("拖动语义区间 1").querySelector(".anticon-holder")
    ).not.toBeNull();
    expect(
      screen.getByLabelText("拖动语法结构 1").querySelector(".anticon-holder")
    ).not.toBeNull();
    expect(screen.queryByLabelText("上移语义区间 1")).toBeNull();
    expect(screen.queryByLabelText("下移语法结构 1")).toBeNull();

    fireEvent.keyDown(screen.getByLabelText("拖动语义区间 2"), {
      key: "ArrowUp"
    });
    fireEvent.keyDown(screen.getByLabelText("拖动语法结构 2"), {
      key: "ArrowUp"
    });

    const reordered = value();
    expect(reordered.sense_groups.map((group) => group.id)).toEqual([
      "sense-group-2",
      "sense-group-1"
    ]);
    expect(
      reordered.pos[0]!.grammar_structures.map((grammar) => grammar.id)
    ).toEqual(["grammar-2", "grammar-1"]);
    expect(reordered.sense_groups.map((group) => group.id).sort()).toEqual(
      originalIds.groups
    );
    expect(
      reordered.pos[0]!.grammar_structures.map((grammar) => grammar.id).sort()
    ).toEqual(originalIds.grammars);
    expect(
      reordered.pos[0]!.grammar_structures.flatMap((grammar) =>
        grammar.variants.map((variant) => variant.id)
      ).sort()
    ).toEqual(originalIds.variants);
    expect(reordered.pos[0]!.senses[0]).toMatchObject({
      id: originalIds.sense,
      sense_group_id: "sense-group-1",
      definitions: [
        expect.objectContaining({
          id: originalIds.definition,
          grammar_structure_id: "grammar-1"
        })
      ]
    });
  });

  it("拖拽手柄与删除按钮共用同一条 32px 中心线", () => {
    render(<Harness wordId="entry-align" />);

    for (const label of ["语义区间", "语法结构"]) {
      const drag = screen.getByLabelText(`拖动${label} 1`);
      const remove = screen.getByLabelText(`删除${label} 1`);
      const actions = drag.closest(".word-sort-actions");
      expect(actions).not.toBeNull();
      expect(remove.closest(".word-sort-actions")).toBe(actions);
    }
    expect(meaningsCss).toMatch(
      /\.word-sort-actions\s*\{[^}]*align-items:\s*center;[^}]*width:\s*var\(--word-ops-col,\s*32px\);/su
    );
    expect(meaningsCss).toMatch(
      /\.word-sort-actions\s*>\s*\.ant-btn\s*\{[^}]*width:\s*32px;/su
    );
  });

  it("语义区间卡片位于步骤顶部、词性 Tabs 之外，并展示全部区间", () => {
    const initial = structuredClone(meaningsFixture);
    initial.sense_groups.push({
      id: "sense-group-2",
      name_zh: "动作区间",
      name_en: "Action range"
    });
    const verb = structuredClone(initial.pos[0]!);
    verb.pos_id = "pos-2";
    verb.senses[0]!.id = "sense-2";
    verb.senses[0]!.sense_group_id = "sense-group-2";
    initial.pos.push(verb);
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        },
        {
          pos_id: "pos-2",
          pos: "verb",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const { container } = render(
      <Harness forms={forms} initial={initial} wordId="entry-pos-groups" />
    );

    const globalCard = container.querySelector<HTMLElement>(
      ".v3-meanings-v2 > .word-sense-groups-card"
    );
    expect(globalCard).not.toBeNull();
    const tabs = container.querySelector(".word-pos-tabs")!;
    expect(
      globalCard!.compareDocumentPosition(tabs) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(tabs.querySelector(".word-sense-groups-card")).toBeNull();
    expect(within(globalCard!).getByLabelText("语义区间 1 中文")).toHaveValue(
      "核心"
    );
    expect(within(globalCard!).getByLabelText("语义区间 2 中文")).toHaveValue(
      "动作区间"
    );
  });

  it("新增语义区间只追加词条级区间，不改动任何词义归属", () => {
    const ids = ["sense-group-new"];
    render(<Harness idFactory={() => ids.shift()!} wordId="entry-add-group" />);

    fireEvent.click(screen.getByRole("button", { name: "添加语义区间" }));
    expect(value().sense_groups.map((group) => group.id)).toEqual([
      "sense-group-1",
      "sense-group-new"
    ]);
    expect(value().pos[0]!.senses).toHaveLength(1);
    expect(value().pos[0]!.senses[0]!.sense_group_id).toBe("sense-group-1");
  }, 15_000);

  it("原生拖放隔离语义区间、语法结构和 POS scope，并清理拖动态", () => {
    const initial = structuredClone(meaningsFixture);
    initial.sense_groups.push({
      id: "sense-group-2",
      name_zh: "次要",
      name_en: "Secondary"
    });
    initial.pos[0]!.grammar_structures.push({
      id: "grammar-2",
      variants: [
        {
          id: "grammar-variant-2",
          dialect: "common",
          content: { version: 2, text: "second grammar", annotations: [] }
        }
      ]
    });
    const { unmount } = render(
      <Harness initial={initial} wordId="entry-drag" />
    );
    const data = new Map<string, string>();
    const types: string[] = [];
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types,
      setData: vi.fn((type: string, payload: string) => {
        data.set(type, payload);
        if (!types.includes(type)) types.push(type);
      }),
      getData: vi.fn((type: string) => data.get(type) ?? "")
    };
    const source = screen.getByLabelText("拖动语义区间 2");
    const target = screen
      .getByLabelText("拖动语义区间 1")
      .closest(".word-sense-group-item")!;

    fireEvent.dragStart(source, { dataTransfer });
    expect(source.closest(".word-sense-group-item")).toHaveClass("is-dragging");
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass("is-drag-over");
    expect(target).toHaveClass("is-drag-over-before");
    fireEvent.drop(target, { dataTransfer });
    expect(value().sense_groups.map((group) => group.id)).toEqual([
      "sense-group-2",
      "sense-group-1"
    ]);
    expect(target).not.toHaveClass("is-drag-over");

    const senseType = "application/x-tsz-v3-sense-group";
    for (const raw of [
      "",
      "not-json",
      JSON.stringify({ scopeId: "entry-drag:pos-1", index: "1" }),
      JSON.stringify({ scopeId: "entry-drag:pos-1", index: -1 }),
      JSON.stringify({ scopeId: "entry-drag:pos-1", index: 99 }),
      JSON.stringify({ scopeId: "entry-drag:pos-1", index: 1 })
    ]) {
      fireEvent.drop(target, {
        dataTransfer: {
          effectAllowed: "none",
          dropEffect: "none",
          types: [senseType],
          setData: vi.fn(),
          getData: vi.fn(() => raw)
        }
      });
    }
    expect(value().sense_groups.map((group) => group.id)).toEqual([
      "sense-group-2",
      "sense-group-1"
    ]);

    const grammarTarget = screen
      .getByLabelText("拖动语法结构 1")
      .closest(".word-grammar-row")!;
    fireEvent.drop(grammarTarget, { dataTransfer });
    expect(
      value().pos[0]!.grammar_structures.map((grammar) => grammar.id)
    ).toEqual(["grammar-1", "grammar-2"]);

    const foreignGrammar = {
      effectAllowed: "none",
      dropEffect: "none",
      types: ["application/x-tsz-v3-grammar-structure"],
      setData: vi.fn(),
      getData: vi.fn(() => JSON.stringify({ scopeId: "other-pos", index: 1 }))
    };
    fireEvent.dragOver(grammarTarget, { dataTransfer: foreignGrammar });
    fireEvent.drop(grammarTarget, { dataTransfer: foreignGrammar });
    expect(
      value().pos[0]!.grammar_structures.map((grammar) => grammar.id)
    ).toEqual(["grammar-1", "grammar-2"]);
    fireEvent.dragEnd(source, { dataTransfer });

    unmount();
    render(<Harness wordId="entry-single" />);
    const singleGroupHandle = screen.getByLabelText("拖动语义区间 1");
    expect(singleGroupHandle).toBeDisabled();
    expect(screen.getByLabelText("拖动语法结构 1")).toBeDisabled();
    const singleGroupRow = singleGroupHandle.closest(".word-sense-group-item")!;
    fireEvent.dragOver(singleGroupRow, {
      dataTransfer: {
        effectAllowed: "none",
        dropEffect: "none",
        types: ["application/x-tsz-v3-sense-group"],
        setData: vi.fn(),
        getData: vi.fn()
      }
    });
    expect(singleGroupRow).not.toHaveClass("is-drag-over");
  });

  it("多维释义复用统一抓手、插入反馈并保持定义身份与引用", () => {
    const initial = structuredClone(meaningsFixture);
    const first = initial.pos[0]!.senses[0]!.definitions[0]!;
    const second = structuredClone(first);
    if (
      second.definition_mode !== "zh_definition" &&
      second.definition_mode !== "zh_sentence"
    ) {
      throw new Error("expected Chinese definition fixture");
    }
    second.id = "definition-2";
    second.content_id = "definition-content-2";
    second.content = { version: 2, text: "次要释义", annotations: [] };
    initial.pos[0]!.senses[0]!.definitions.push(second);
    render(<Harness initial={initial} wordId="entry-definition-drag" />);

    const handles = [
      screen.getByLabelText("拖动定义 1"),
      screen.getByLabelText("拖动定义 2")
    ];
    expect(handles[0]!.querySelector(".anticon-holder")).not.toBeNull();
    expect(screen.queryByLabelText("上移定义 1")).toBeNull();
    expect(screen.queryByLabelText("下移定义 2")).toBeNull();

    const data = new Map<string, string>();
    const types: string[] = [];
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types,
      setData: (type: string, payload: string) => {
        data.set(type, payload);
        if (!types.includes(type)) types.push(type);
      },
      getData: (type: string) => data.get(type) ?? ""
    };
    const target = handles[0]!.closest(".word-definition-row")!;
    fireEvent.dragStart(handles[1]!, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass("is-drag-over-before");
    fireEvent.drop(target, { dataTransfer });

    const definitions = value().pos[0]!.senses[0]!.definitions;
    expect(definitions.map((definition) => definition.id)).toEqual([
      "definition-2",
      "definition-1"
    ]);
    expect(
      definitions.map((definition) => {
        if (
          definition.definition_mode !== "zh_definition" &&
          definition.definition_mode !== "zh_sentence"
        ) {
          throw new Error("expected Chinese definition fixture");
        }
        return definition.content.text;
      })
    ).toEqual(["次要释义", "中心"]);
    expect(
      definitions.map((definition) => definition.grammar_structure_id)
    ).toEqual(["grammar-1", "grammar-1"]);
  });

  it("多维例句复用统一抓手并整体移动双语内容与主关联", () => {
    const initial = structuredClone(meaningsFixture);
    const first = initial.pos[0]!.senses[0]!.sentences[0]!;
    const second = structuredClone(first);
    second.id = "sentence-2";
    second.zh_text_id = "sentence-zh-2";
    second.zh_text = { version: 2, text: "第二条例句。", annotations: [] };
    if (second.en_text.mode !== "unified") {
      throw new Error("expected unified sentence fixture");
    }
    second.en_text.common.id = "sentence-en-2";
    second.en_text.common.value = {
      version: 2,
      text: "Second example.",
      annotations: []
    };
    initial.pos[0]!.senses[0]!.sentences.push(second);
    render(<Harness initial={initial} wordId="entry-sentence-drag" />);

    const handles = [
      screen.getByLabelText("拖动例句 1"),
      screen.getByLabelText("拖动例句 2")
    ];
    expect(handles[0]!.querySelector(".anticon-holder")).not.toBeNull();
    expect(screen.queryByLabelText("上移例句 1")).toBeNull();
    expect(screen.queryByLabelText("下移例句 2")).toBeNull();

    const data = new Map<string, string>();
    const types: string[] = [];
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types,
      setData: (type: string, payload: string) => {
        data.set(type, payload);
        if (!types.includes(type)) types.push(type);
      },
      getData: (type: string) => data.get(type) ?? ""
    };
    const target = handles[0]!.closest(".word-sentence-row")!;
    fireEvent.dragStart(handles[1]!, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass("is-drag-over-before");
    fireEvent.drop(target, { dataTransfer });

    const sentences = value().pos[0]!.senses[0]!.sentences;
    expect(sentences.map((sentence) => sentence.id)).toEqual([
      "sentence-2",
      "sentence-1"
    ]);
    expect(sentences.map((sentence) => sentence.zh_text.text)).toEqual([
      "第二条例句。",
      "市中心很繁忙。"
    ]);
    expect(sentences.map((sentence) => sentence.links[0])).toEqual([
      first.links[0],
      first.links[0]
    ]);
  });

  it("页内编辑正文不改动底层 links", () => {
    const { container } = render(<Harness wordId="entry-hidden-links" />);
    const editor = container.querySelector(".word-sentence-associations");
    expect(editor).not.toBeNull();
    expect(editor).toHaveAttribute("hidden");

    const linksBefore = structuredClone(
      value().pos[0]!.senses[0]!.sentences[0]!.links
    );
    fireEvent.change(screen.getByLabelText("例句 1 通用英文"), {
      target: { value: "Updated sentence." }
    });
    expect(value().pos[0]!.senses[0]!.sentences[0]!.en_text).toMatchObject({
      common: { id: "sentence-en-1", value: { text: "Updated sentence." } }
    });
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual(linksBefore);
  });

  it("使用后端 node/field 规范暴露 rich-text、grammar 与 sentence-link locators", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.definitions.push({
      id: "definition-en-1",
      level: "A1",
      definition_mode: "en_definition",
      content: {
        mode: "unified",
        common: {
          id: "definition-en-variant-1",
          origin: "manual",
          value: { version: 2, text: "centre", annotations: [] }
        }
      }
    });
    const { container } = render(<Harness initial={initial} />);

    for (const selector of [
      '[data-v3-node-id="grammar-1"][data-v3-field="variants"]',
      '[data-v3-node-id="definition-en-variant-1"][data-v3-field="value"]',
      '[data-v3-node-id="sentence-en-1"][data-v3-field="value"]',
      '[data-v3-node-id="sentence-zh-1"][data-v3-field="zh_translations"]',
      '[data-v3-node-id="sentence-1"][data-v3-field="links"]'
    ]) {
      expect(container.querySelector(selector)).not.toBeNull();
    }
  });

  it("controlled 编辑 frequency/grammar/definition/relation 且外层例句保持只读", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("释义 1 频率"), {
      target: { value: "42.5" }
    });
    fireEvent.change(screen.getByLabelText("语法结构 1 通用内容"), {
      target: { value: "updated grammar" }
    });
    fireEvent.change(screen.getByLabelText("定义 1 内容"), {
      target: { value: "更新后的中心" }
    });
    fireEvent.change(screen.getByLabelText("相似度"), {
      target: { value: "0.9" }
    });

    const draft = value();
    const pos = draft.pos[0]!;
    const sense = pos.senses[0]!;
    expect(pos.grammar_structures[0]!.variants[0]).toMatchObject({
      id: "grammar-variant-1",
      content: { text: "updated grammar" }
    });
    expect(sense).toMatchObject({
      id: "sense-1",
      frequency: "42.5",
      definitions: [{ id: "definition-1", content: { text: "更新后的中心" } }],
      sentences: [
        {
          id: "sentence-1",
          en_text: {
            common: {
              id: "sentence-en-1",
              value: { text: "The city center is busy." }
            }
          },
          zh_text: { text: "市中心很繁忙。" }
        }
      ],
      relations: [{ id: "relation-1", score: "0.9" }]
    });
  });

  it("词频标题位于输入框上方，并使用 0-100 两位小数与百分号后缀", () => {
    render(<Harness />);
    const frequency = screen.getByLabelText("释义 1 频率");
    expect(frequency).toHaveAttribute("role", "spinbutton");
    expect(frequency.closest(".ant-input-number")).toHaveTextContent("%");
    expect(meaningsCss).toMatch(
      /\.word-sense-field-frequency\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/su
    );

    fireEvent.change(frequency, { target: { value: "99.99" } });
    expect(value().pos[0]!.senses[0]!.frequency).toBe("99.99");
    fireEvent.change(frequency, { target: { value: "" } });
    expect(value().pos[0]!.senses[0]).not.toHaveProperty("frequency");
  });

  it("#145 four definition modes reuse the V3 definition identity and create only the required text node", () => {
    const ids = ["english-text-variant", "chinese-content"];
    render(<Harness idFactory={() => ids.shift()!} />);

    fireEvent.mouseDown(screen.getByLabelText("定义 1 方式"));
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ].map((option) => option.textContent)
    ).toEqual(["中文定义释义", "英文定义释义", "中文整句释义", "英文整句释义"]);
    fireEvent.click(screen.getByText("英文定义释义"));
    expect(value().pos[0]!.senses[0]!.definitions[0]).toMatchObject({
      id: "definition-1",
      definition_mode: "en_definition",
      content: {
        mode: "unified",
        common: {
          id: "english-text-variant",
          value: { text: "中心" }
        }
      }
    });

    fireEvent.mouseDown(screen.getByLabelText("定义 1 方式"));
    fireEvent.click(screen.getByText("中文整句释义"));
    expect(value().pos[0]!.senses[0]!.definitions[0]).toMatchObject({
      id: "definition-1",
      definition_mode: "zh_sentence",
      content_id: "chinese-content",
      content: { text: "中心" }
    });
  });

  it.each(["Enter", " "])(
    "#150 %s toggles the focused context dependency switch",
    (key) => {
      render(<Harness />);
      const contextSwitch = screen.getByRole("switch", {
        name: "释义 1 是否依赖语境"
      });

      fireEvent.keyDown(contextSwitch, { key });

      expect(value().pos[0]!.senses[0]!.depends_on_context).toBe(true);
      expect(value().pos[0]!.senses[0]!.id).toBe("sense-1");
    }
  );

  it("#179-#180 restores fixed CEFR Selects and reads back existing levels", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.level = "A2";
    initial.pos[0]!.senses[0]!.definitions[0]!.level = "B1";
    initial.pos[0]!.senses[0]!.sentences[0]!.level = "C1";
    render(<Harness initial={initial} wordId="entry-1" />);

    const fields = [
      {
        label: "释义 1 等级",
        initialLevel: "A2"
      },
      {
        label: "定义 1 等级",
        initialLevel: "B1"
      },
      {
        label: "例句 1 等级",
        initialLevel: "C1"
      }
    ];

    expect(value()).toEqual(initial);
    for (const field of fields) {
      const control = screen.getByLabelText(field.label);
      expect(control).toHaveAttribute("role", "combobox");
      expect(control.closest(".ant-select")).toHaveTextContent(
        field.initialLevel
      );
    }

    fireEvent.mouseDown(screen.getByLabelText("释义 1 等级"));
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ].map((option) => option.textContent)
    ).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it.each([
    {
      label: "释义 1 等级",
      nextLevel: "B2",
      update: (draft: DraftMeaningsStepContentWritableV3) => {
        draft.pos[0]!.senses[0]!.level = "B2";
      }
    },
    {
      label: "定义 1 等级",
      nextLevel: "C1",
      update: (draft: DraftMeaningsStepContentWritableV3) => {
        draft.pos[0]!.senses[0]!.definitions[0]!.level = "C1";
      }
    }
  ])(
    "#181 $label changes only its target level string",
    ({ label, nextLevel, update }) => {
      render(<Harness wordId="entry-1" />);
      const before = structuredClone(value());
      const expected = structuredClone(before);
      update(expected);

      fireEvent.mouseDown(screen.getByLabelText(label));
      const choice = [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ].find((option) => option.textContent === nextLevel);
      expect(choice).toBeDefined();
      fireEvent.click(choice!);

      expect(value()).toEqual(expected);
    }
  );

  it("#182 preserves unknown historical CEFR strings until a valid option is selected", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.level = "legacy-sense";
    initial.pos[0]!.senses[0]!.definitions[0]!.level = "legacy-definition";
    initial.pos[0]!.senses[0]!.sentences[0]!.level = "legacy-sentence";
    render(<Harness initial={initial} wordId="entry-1" />);

    expect(value()).toEqual(initial);
    for (const [label, historicalLevel] of [
      ["释义 1 等级", "legacy-sense"],
      ["定义 1 等级", "legacy-definition"],
      ["例句 1 等级", "legacy-sentence"]
    ] as const) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute("role", "combobox");
      expect(control.closest(".ant-select")).toHaveTextContent(historicalLevel);
    }

    fireEvent.mouseDown(screen.getByLabelText("释义 1 等级"));
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ].map((option) => option.textContent)
    ).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
    fireEvent.click(screen.getAllByText("B2").at(-1)!);

    const expected = structuredClone(initial);
    expected.pos[0]!.senses[0]!.level = "B2";
    expect(value()).toEqual(expected);
  });

  it("可选字段可清空再恢复，语法结构保持必选并维护基础字段", () => {
    const initial = structuredClone(meaningsFixture);
    initial.sense_groups.push({
      id: "sense-group-2",
      name_zh: "次要",
      name_en: "Secondary"
    });
    initial.pos[0]!.grammar_structures.push({
      id: "grammar-2",
      variants: [
        {
          id: "grammar-variant-2",
          dialect: "common",
          content: { version: 2, text: "used as a verb", annotations: [] }
        }
      ]
    });
    initial.pos[0]!.senses.push({
      id: "sense-2",
      sub_pos: "countable",
      level: "A2",
      depends_on_context: false,
      definitions: [],
      sentences: [],
      relations: []
    });
    initial.pos[0]!.senses.push({
      id: "sense-3",
      sub_pos: "countable",
      level: "B1",
      depends_on_context: false,
      definitions: [],
      sentences: [],
      relations: []
    });
    const { container } = render(
      <Harness initial={initial} wordId="entry-1" />
    );
    const change = (label: string, nextValue: string) => {
      const input = container.querySelector<
        HTMLInputElement | HTMLTextAreaElement
      >(`[aria-label="${label}"]`);
      expect(input).not.toBeNull();
      fireEvent.change(input!, { target: { value: nextValue } });
    };
    const select = (label: string, option: string) => {
      fireEvent.mouseDown(screen.getByLabelText(label));
      fireEvent.click(screen.getAllByText(option).at(-1)!);
    };

    select("释义 1 所属语义区间", "不归入语义区间");
    change("释义 1 频率", "");
    expect(value().pos[0]!.senses[0]).not.toHaveProperty("sense_group_id");
    expect(value().pos[0]!.senses[0]).not.toHaveProperty("frequency");
    expect(screen.getByLabelText("近义词目标词条")).toHaveValue("已选择关联词");

    select("释义 1 所属语义区间", "次要");
    change("释义 1 频率", "37.25");
    select("定义 1 语法结构", "② used as a verb");
    select("释义 1 等级", "B1");
    select("定义 1 等级", "B2");
    fireEvent.click(
      screen.getByRole("switch", { name: "释义 1 是否依赖语境" })
    );

    const sense = value().pos[0]!.senses[0]!;
    expect(sense).toMatchObject({
      sub_pos: "countable",
      level: "B1",
      sense_group_id: "sense-group-2",
      frequency: "37.25",
      depends_on_context: true,
      definitions: [
        expect.objectContaining({
          level: "B2",
          grammar_structure_id: "grammar-2"
        })
      ],
      sentences: [
        expect.objectContaining({
          level: "A1",
          links: initial.pos[0]!.senses[0]!.sentences[0]!.links
        })
      ],
      relations: [expect.objectContaining({ relation: "synonym" })]
    });
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual(
      initial.pos[0]!.senses[0]!.sentences[0]!.links
    );
  });

  it("用中文业务标签呈现词性和引用选择，不暴露内部代码或 ID", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const partOfSpeechCatalog: PartOfSpeechCatalogResponse = {
      catalog_version: 1,
      items: [
        {
          id: "catalog-noun",
          code: "noun",
          name_zh: "名词",
          name_en: "Noun",
          abbreviation: "n.",
          sort_order: 1,
          allowed_form_types: [],
          default_form_types: [],
          sub_parts: [
            {
              id: "catalog-countable",
              code: "countable",
              name_zh: "可数名词",
              name_en: "Countable noun",
              sort_order: 1
            }
          ]
        }
      ]
    };
    render(<Harness forms={forms} partOfSpeechCatalog={partOfSpeechCatalog} />);
    const editor = screen.getByTestId("meanings-value").previousElementSibling;

    expect(screen.getByRole("tab", { name: /^名词/u })).toBeInTheDocument();
    expect(screen.getAllByText("可数名词")).toHaveLength(2);
    expect(screen.getByText("核心")).toBeInTheDocument();
    expect(screen.getAllByText("① used as a noun")).toHaveLength(1);
    expect(editor).not.toHaveTextContent("pos-1");
    expect(editor).not.toHaveTextContent("sense-group-1");
    expect(editor).not.toHaveTextContent("grammar-1");
    expect(editor).not.toHaveTextContent("countable");
  });

  it("zh_sentence 与 distinguish EnglishText 暴露各自 locator 并保持方言 UUID", () => {
    const initial = structuredClone(meaningsFixture);
    initial.pos[0]!.senses[0]!.definitions[0] = {
      id: "definition-zh-sentence",
      level: "A2",
      definition_mode: "zh_sentence",
      content_id: "definition-zh-content",
      content: { version: 2, text: "中文句意", annotations: [] }
    };
    initial.pos[0]!.senses[0]!.definitions.push({
      id: "definition-en-sentence",
      level: "B1",
      definition_mode: "en_sentence",
      content: {
        mode: "distinguish",
        source_dialect: "uk",
        uk: {
          state: "ready",
          variant: {
            id: "definition-uk",
            origin: "manual",
            value: { version: 2, text: "UK meaning", annotations: [] }
          }
        },
        us: { state: "missing" }
      }
    });
    initial.pos[0]!.senses[0]!.sentences[0]!.en_text = {
      mode: "distinguish",
      source_dialect: "us",
      uk: { state: "missing" },
      us: {
        state: "ready",
        variant: {
          id: "sentence-us",
          origin: "manual",
          value: { version: 2, text: "US example", annotations: [] }
        }
      }
    };
    const { container } = render(<Harness initial={initial} />);

    const zh = container.querySelector<HTMLTextAreaElement>(
      '[data-v3-node-id="definition-zh-sentence"][data-v3-field="content"]'
    );
    const uk = container.querySelector<HTMLTextAreaElement>(
      '[data-v3-node-id="definition-uk"][data-v3-field="value"]'
    );
    const us = container.querySelector<HTMLTextAreaElement>(
      '[data-v3-node-id="sentence-us"][data-v3-field="value"]'
    );
    expect(zh).not.toBeNull();
    expect(uk).not.toBeNull();
    expect(us).not.toBeNull();
    fireEvent.change(zh!, { target: { value: "更新中文句意" } });
    fireEvent.change(uk!, { target: { value: "Updated UK meaning" } });
    expect(us).not.toHaveAttribute("readonly");
    fireEvent.change(us!, { target: { value: "Updated US example" } });

    const sense = value().pos[0]!.senses[0]!;
    expect(sense.definitions).toEqual([
      expect.objectContaining({
        id: "definition-zh-sentence",
        content: expect.objectContaining({ text: "更新中文句意" })
      }),
      expect.objectContaining({
        id: "definition-en-sentence",
        content: expect.objectContaining({
          uk: expect.objectContaining({
            variant: expect.objectContaining({
              id: "definition-uk",
              value: expect.objectContaining({ text: "Updated UK meaning" })
            })
          }),
          us: { state: "missing" }
        })
      })
    ]);
    expect(sense.sentences[0]!.en_text).toMatchObject({
      uk: { state: "missing" },
      us: {
        state: "ready",
        variant: { id: "sentence-us", value: { text: "Updated US example" } }
      }
    });
  });

  it("单项列表移动入口禁用，词义管理收进菜单，保存态禁用提交", () => {
    const { container } = render(<Harness />);
    for (const label of [
      "拖动语义区间 1",
      "拖动语法结构 1",
      "拖动定义 1",
      "拖动例句 1"
    ]) {
      expect(
        container.querySelector<HTMLButtonElement>(
          `button[aria-label="${label}"]`
        )
      ).toBeDisabled();
    }
    expect(screen.queryByLabelText("上移定义 1")).toBeNull();
    expect(screen.queryByLabelText("下移定义 1")).toBeNull();
    expect(screen.queryByLabelText("上移例句 1")).toBeNull();
    expect(screen.queryByLabelText("下移例句 1")).toBeNull();
    expect(screen.getByRole("button", { name: "管理词义 1" })).toBeEnabled();
    const { container: savingContainer } = render(
      <AntApp>
        <V3MeaningsAndExamplesStep
          onChange={() => undefined}
          onSave={vi.fn().mockResolvedValue(undefined)}
          saving
          value={meaningsFixture}
        />
      </AntApp>
    );
    const saveButtons = Array.from(
      savingContainer.querySelectorAll<HTMLButtonElement>("button")
    ).filter((button) =>
      ["保存草稿", "完成并进入预览"].includes(button.textContent ?? "")
    );
    expect(saveButtons).toHaveLength(2);
    expect(saveButtons.every((button) => button.disabled)).toBe(true);

    const { container: noSaveContainer } = render(
      <AntApp>
        <V3MeaningsAndExamplesStep
          onChange={() => undefined}
          value={{ sense_groups: [], pos: [] }}
        />
      </AntApp>
    );
    expect(
      Array.from(noSaveContainer.querySelectorAll("button")).some((button) =>
        ["保存草稿", "完成并进入预览"].includes(button.textContent ?? "")
      )
    ).toBe(false);
  });

  it("无语义区间时新增 sense 不产生缺失引用；词性 Tab 仍由 forms 驱动", () => {
    const emptyNested: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [],
      pos: [{ pos_id: "pos-1", grammar_structures: [], senses: [] }]
    };
    const { container } = render(
      <Harness idFactory={() => "sense-without-group"} initial={emptyNested} />
    );
    fireEvent.click(screen.getByText("添加词义"));
    expect(value().pos[0]!.senses[0]).toMatchObject({
      id: "sense-without-group",
      definitions: [],
      sentences: [],
      relations: []
    });
    expect(value().pos[0]!.senses[0]).not.toHaveProperty("sense_group_id");
    expect(container.querySelector('[aria-label^="上移定义"]')).toBeNull();
    expect(container.querySelector('[aria-label^="上移例句"]')).toBeNull();
    expect(container.querySelector('[aria-label^="上移关联"]')).toBeNull();

    const twoPos = structuredClone(meaningsFixture);
    twoPos.pos.push({ pos_id: "pos-2", grammar_structures: [], senses: [] });
    const onActivePosChange = vi.fn();
    const { container: twoPosContainer } = render(
      <AntApp>
        <V3MeaningsAndExamplesStep
          activePosId="pos-1"
          onActivePosChange={onActivePosChange}
          onChange={() => undefined}
          value={twoPos}
        />
      </AntApp>
    );
    expect(twoPosContainer.querySelector('[role="tablist"]')).not.toBeNull();
    expect(onActivePosChange).not.toHaveBeenCalled();
  });

  it.each(["save", "complete"] as const)(
    "%s 只把当前 writable draft 交给 T5A action",
    async (intent) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<Harness onSave={onSave} />);
      fireEvent.change(screen.getByLabelText("释义 1 频率"), {
        target: { value: "12.5" }
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: intent === "save" ? "保存草稿" : "完成并进入预览"
        })
      );

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          pos: [
            expect.objectContaining({
              senses: [expect.objectContaining({ frequency: "12.5" })]
            })
          ]
        }),
        intent
      );
    }
  );

  it("save 失败保留本地输入；controlled canonical rerender 精确替换", async () => {
    const failed = vi.fn().mockRejectedValue(new Error("network"));
    const initial = structuredClone(meaningsFixture);
    const { rerender } = render(<Harness initial={initial} onSave={failed} />);
    fireEvent.change(screen.getByLabelText("释义 1 频率"), {
      target: { value: "12.5" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(screen.getByLabelText("释义 1 频率")).toHaveValue("12.50");

    const canonical = structuredClone(initial);
    canonical.pos[0]!.senses[0]!.frequency = "64.25";
    rerender(
      <AntApp>
        <V3MeaningsAndExamplesStep
          onChange={() => undefined}
          onSave={vi.fn().mockResolvedValue(undefined)}
          value={canonical}
        />
      </AntApp>
    );
    expect(screen.getByLabelText("释义 1 频率")).toHaveValue("64.25");
  });

  it("deep 422 issue 激活非当前 POS 并暴露精确 node/field focus locator", () => {
    const base = structuredClone(meaningsFixture);
    const second = structuredClone(base.pos[0]!);
    second.pos_id = "pos-2";
    second.senses[0]!.id = "sense-2";
    second.senses[0]!.definitions[0]!.id = "definition-2";
    const content = { ...base, pos: [base.pos[0]!, second] };
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "meanings",
      node_id: "definition-2",
      field: "content",
      code: "definition_invalid",
      message: "第二词性的释义无效",
      node_location: {
        node_role: "meanings.definition",
        ancestor_node_ids: ["pos-2", "sense-2"],
        pos_id: "pos-2"
      }
    };

    function DeepHarness() {
      const [activePosId, setActivePosId] = useState("pos-1");
      return (
        <AntApp>
          <button onClick={() => setActivePosId("pos-2")}>
            定位 meanings issue
          </button>
          <V3MeaningsAndExamplesStep
            activePosId={activePosId}
            issues={[issue]}
            onActivePosChange={setActivePosId}
            onChange={() => undefined}
            value={content}
          />
        </AntApp>
      );
    }
    const { container } = render(<DeepHarness />);
    fireEvent.click(screen.getByText("定位 meanings issue"));
    const target = container.querySelector<HTMLElement>(
      '[data-v3-node-id="definition-2"][data-v3-field="content"]'
    );
    expect(target).not.toBeNull();
    target!.focus();
    expect(document.activeElement).toBe(target);
    expect(
      screen.getByText("请完整填写释义并选择语法结构")
    ).toBeInTheDocument();
  });

  it("#141-#147 restores the V2 Step 3 product hierarchy without exposing V3 identity", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const partOfSpeechCatalog: PartOfSpeechCatalogResponse = {
      catalog_version: 1,
      items: [
        {
          id: "catalog-noun",
          code: "noun",
          name_zh: "名词",
          name_en: "Noun",
          abbreviation: "n.",
          sort_order: 1,
          allowed_form_types: [],
          default_form_types: [],
          sub_parts: [
            {
              id: "catalog-countable",
              code: "countable",
              name_zh: "可数名词",
              name_en: "Countable noun",
              sort_order: 1
            }
          ]
        }
      ]
    };
    const { container } = render(
      <Harness
        forms={forms}
        partOfSpeechCatalog={partOfSpeechCatalog}
        wordId="entry-1"
      />
    );
    const editor = screen.getByTestId("meanings-value").previousElementSibling;

    expect(container.querySelector(".word-step-number")).toHaveTextContent(
      "STEP 03"
    );
    expect(screen.getByText("词义与例句")).toBeVisible();
    expect(container.querySelector(".word-sense-groups-card")).not.toBeNull();
    expect(screen.getAllByText("语义区间")).toHaveLength(2);
    expect(screen.getByText("添加语义区间").closest("button")).toBeVisible();
    expect(container.querySelector(".word-grammar-card")).not.toBeNull();
    expect(container.querySelector(".word-sense-editor-a1")).not.toBeNull();
    expect(screen.getByText("多维释义")).toBeVisible();
    expect(screen.getByText("多维例句")).toBeVisible();
    expect(screen.getByText("关联词")).toBeVisible();
    expect(container.querySelector(".word-relations-grid")).not.toBeNull();
    expect(container.querySelectorAll(".word-relation-card")).toHaveLength(3);
    expect(screen.getAllByText("近义词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("反义词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("派生词").length).toBeGreaterThan(0);
    expect(screen.getByText("添加释义").closest("button")).toBeVisible();
    expect(screen.getByText("添加例句").closest("button")).toBeVisible();
    expect(screen.getByText("完成并进入预览").closest("button")).toBeVisible();
    expect(screen.queryByText("删除当前词性释义")).toBeNull();
    const senseEditor = container.querySelector<HTMLElement>(
      '[data-v3-field="sense"]'
    )!;
    senseEditor.focus();
    expect(senseEditor).toHaveFocus();
    expect(editor).not.toHaveTextContent("sense-group-1");
    expect(editor).not.toHaveTextContent("definition-content-1");
  });

  it("#142 derives V2-style POS tabs from forms before meanings content exists", () => {
    const forms = structuredClone(meaningsFixture);
    const formsContent: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    forms.pos = [];
    render(<Harness forms={formsContent} initial={forms} wordId="entry-1" />);

    expect(screen.getByRole("tab", { name: /^名词/u })).toBeVisible();
    expect(screen.queryByText("当前词性还没有词义内容")).toBeNull();
    expect(screen.queryByRole("button", { name: "开始录入词义" })).toBeNull();
    expect(screen.queryByText(/暂无语义区间/u)).toBeNull();
    expect(screen.queryByText("草稿可暂时不添加词性释义")).toBeNull();
  });
});
