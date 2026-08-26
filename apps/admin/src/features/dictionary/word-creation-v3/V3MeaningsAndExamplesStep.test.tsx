import { fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import type {
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  PartOfSpeechCatalogResponse,
  V3DraftValidationIssue
} from "@tsz/types";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { V3MeaningsAndExamplesStep } from "./V3MeaningsAndExamplesStep";

const relatedSearchAny = vi.hoisted(() =>
  vi.fn(() => ({
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
                senses: [{ sense_id: "external-sense-1", gloss: "外部词义一" }]
              }
            ],
            total: 1,
            next_cursor: null
          }
        ]
      },
      isFetching: false
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
                senses: [{ sense_id: "external-sense-2", gloss: "外部词义二" }]
              }
            ],
            total: 1,
            next_cursor: null
          }
        ]
      },
      isFetching: false
    }
  }))
);

vi.mock("../api", () => ({ useRelatedSearchAny: relatedSearchAny }));

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
          frequency: "high",
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
  partOfSpeechCatalog,
  wordId
}: {
  initial?: DraftMeaningsStepContentWritableV3;
  issues?: V3DraftValidationIssue[];
  onSave?: (
    content: DraftMeaningsStepContentWritableV3,
    intent: "save" | "complete"
  ) => Promise<void>;
  idFactory?: () => string;
  forms?: DraftFormsStepContentV3;
  partOfSpeechCatalog?: PartOfSpeechCatalogResponse;
  wordId?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AntApp>
      <V3MeaningsAndExamplesStep
        activePosId="pos-1"
        forms={forms}
        idFactory={idFactory}
        issues={issues}
        onChange={setValue}
        onSave={onSave}
        partOfSpeechCatalog={partOfSpeechCatalog}
        value={value}
        wordId={wordId}
      />
      <output data-testid="meanings-value">{JSON.stringify(value)}</output>
    </AntApp>
  );
}

function value(): DraftMeaningsStepContentWritableV3 {
  return JSON.parse(screen.getByTestId("meanings-value").textContent ?? "");
}

describe("V3MeaningsAndExamplesStep", () => {
  it("空 canonical draft 可从当前 POS 建立最小释义链", () => {
    const ids = [
      "sense-group-new",
      "grammar-new",
      "grammar-variant-new",
      "sense-new",
      "definition-new",
      "definition-content-new",
      "sentence-new",
      "sentence-en-new",
      "sentence-zh-new",
      "relation-new"
    ];
    render(
      <Harness
        idFactory={() => ids.shift()!}
        initial={{ sense_groups: [], pos: [] }}
        wordId="entry-new"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "新增释义组" }));
    fireEvent.click(screen.getByRole("button", { name: "添加当前词性释义" }));
    fireEvent.click(screen.getByRole("button", { name: "新增语法结构" }));
    fireEvent.click(screen.getByRole("button", { name: "新增释义" }));
    fireEvent.click(screen.getByRole("button", { name: "新增定义" }));
    fireEvent.click(screen.getByRole("button", { name: "新增例句" }));
    fireEvent.click(screen.getByRole("button", { name: "新增关联" }));

    expect(value()).toMatchObject({
      sense_groups: [{ id: "sense-group-new" }],
      pos: [
        {
          pos_id: "pos-1",
          grammar_structures: [
            {
              id: "grammar-new",
              variants: [{ id: "grammar-variant-new", dialect: "common" }]
            }
          ],
          senses: [
            {
              id: "sense-new",
              definitions: [
                {
                  id: "definition-new",
                  content_id: "definition-content-new"
                }
              ],
              sentences: [
                {
                  id: "sentence-new",
                  en_text: { common: { id: "sentence-en-new" } },
                  zh_text_id: "sentence-zh-new",
                  links: [
                    {
                      word_id: "entry-new",
                      sense_id: "sense-new",
                      role: "focus"
                    }
                  ]
                }
              ],
              relations: [{ id: "relation-new" }]
            }
          ]
        }
      ]
    });
  });

  it("错误或重复主关联可归一，并可搜索短语新增、切换、去重外部上下文词义", () => {
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

    fireEvent.click(screen.getByText("修复主关联"));
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual([
      { word_id: "entry-1", sense_id: "sense-1", role: "focus" },
      {
        word_id: "existing-context-word",
        sense_id: "existing-context-sense",
        role: "context"
      }
    ]);

    const addTarget = screen.getByLabelText("为例句 1 新增上下文关联");
    fireEvent.change(addTarget, { target: { value: "outside" } });
    expect(relatedSearchAny).toHaveBeenLastCalledWith(
      "outside",
      undefined,
      true
    );
    fireEvent.click(screen.getByText("outside · 外部词义一"));
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links[2]).toEqual({
      word_id: "external-word-1",
      sense_id: "external-sense-1",
      role: "context"
    });

    fireEvent.change(addTarget, { target: { value: "outside" } });
    expect(screen.queryAllByText("outside · 外部词义一")).toHaveLength(1);

    const editTarget = screen.getByLabelText("例句 1 上下文关联 3 目标");
    fireEvent.change(editTarget, { target: { value: "beyond" } });
    fireEvent.click(screen.getByText("beyond · 外部词义二"));
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links[2]).toEqual({
      word_id: "external-word-2",
      sense_id: "external-sense-2",
      role: "context"
    });
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="例句 1 上下文关联 3 目标"]'
      )?.value
    ).toBe("beyond · 外部词义二");
  });

  it("单个 head 与当前词义 context 都可归一为唯一 focus", () => {
    const headDraft = structuredClone(meaningsFixture);
    const { unmount } = render(
      <Harness initial={headDraft} wordId="entry-1" />
    );
    fireEvent.click(screen.getByText("修复主关联"));
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual([
      { word_id: "entry-1", sense_id: "sense-1", role: "focus" }
    ]);
    unmount();

    const contextDraft = structuredClone(meaningsFixture);
    contextDraft.pos[0]!.senses[0]!.sentences[0]!.links = [
      { word_id: "entry-1", sense_id: "sense-1", role: "context" }
    ];
    render(<Harness initial={contextDraft} wordId="entry-1" />);
    fireEvent.click(screen.getByText("补充主关联"));
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual([
      { word_id: "entry-1", sense_id: "sense-1", role: "focus" }
    ]);
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

    for (const name of [
      "下移释义组 1",
      "下移语法结构 1",
      "下移释义 1",
      "下移定义 1",
      "下移例句 1",
      "下移关联 1"
    ]) {
      clickAction(name);
    }
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
      "relation-2",
      "relation-1"
    ]);

    for (const name of ["删除定义 2", "删除例句 2", "删除关联 2"]) {
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

    clickAction("删除释义组 2");
    expect(value().pos[0]!.senses[1]).not.toHaveProperty("sense_group_id");
    clickAction("删除语法结构 2");
    expect(value().pos[0]!.senses[1]!.definitions[0]).not.toHaveProperty(
      "grammar_structure_id"
    );
    clickAction("删除释义 2");
    expect(value().sense_groups.map((item) => item.id)).toEqual([
      "sense-group-2"
    ]);
    expect(value().pos[0]!.grammar_structures.map((item) => item.id)).toEqual([
      "grammar-2"
    ]);
    expect(value().pos[0]!.senses.map((item) => item.id)).toEqual(["sense-2"]);
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
      '[data-v3-node-id="sentence-zh-1"][data-v3-field="zh_text"]',
      '[data-v3-node-id="sentence-1"][data-v3-field="links"]'
    ]) {
      expect(container.querySelector(selector)).not.toBeNull();
    }
  });

  it("controlled 编辑 frequency/grammar/definition/examples/relation 且稳定 UUID 不变", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("释义 1 频率"), {
      target: { value: "medium" }
    });
    fireEvent.change(screen.getByLabelText("语法结构 1 内容 1"), {
      target: { value: "updated grammar" }
    });
    fireEvent.change(screen.getByLabelText("定义 1 内容"), {
      target: { value: "更新后的中心" }
    });
    fireEvent.change(screen.getByLabelText("例句 1 通用英文"), {
      target: { value: "Updated example." }
    });
    fireEvent.change(screen.getByLabelText("例句 1 中文"), {
      target: { value: "更新后的例句。" }
    });
    fireEvent.change(screen.getByLabelText("关联 1 分数"), {
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
      frequency: "medium",
      definitions: [{ id: "definition-1", content: { text: "更新后的中心" } }],
      sentences: [
        {
          id: "sentence-1",
          en_text: {
            common: { id: "sentence-en-1", value: { text: "Updated example." } }
          },
          zh_text: { text: "更新后的例句。" }
        }
      ],
      relations: [{ id: "relation-1", score: "0.9" }]
    });
  });

  it("可选字段可清空再恢复，并锁定主关联、维护上下文关联与基础字段", () => {
    const initial = structuredClone(meaningsFixture);
    initial.sense_groups.push({
      id: "sense-group-2",
      name_zh: "次要",
      name_en: "Secondary"
    });
    initial.pos[0]!.grammar_structures.push({
      id: "grammar-2",
      variants: []
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
    fireEvent.click(screen.getByText("修复主关联"));
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

    select("释义 1 所属释义组", "不归入释义组");
    change("释义 1 频率", "");
    select("定义 1 语法结构", "不指定语法结构");
    expect(value().pos[0]!.senses[0]).not.toHaveProperty("sense_group_id");
    expect(value().pos[0]!.senses[0]).not.toHaveProperty("frequency");
    expect(value().pos[0]!.senses[0]!.definitions[0]).not.toHaveProperty(
      "grammar_structure_id"
    );
    expect(screen.getByText("已选择关联目标")).toBeInTheDocument();

    select("释义 1 所属释义组", "次要");
    change("释义 1 频率", "medium");
    select("定义 1 语法结构", "语法结构 2");
    change("释义 1 等级", "B1");
    change("定义 1 等级", "B2");
    change("例句 1 等级", "C1");
    fireEvent.mouseDown(screen.getByLabelText("关联 1 类型"));
    fireEvent.click(screen.getByText("派生词"));
    fireEvent.click(container.querySelector('input[type="checkbox"]')!);

    expect(screen.queryByLabelText("例句 1 关联 1 类型")).toBeNull();
    expect(screen.queryByLabelText("删除例句 1 的关联 1")).toBeNull();
    fireEvent.mouseDown(screen.getByLabelText("为例句 1 新增上下文关联"));
    fireEvent.click(screen.getByText("词性 1 · 释义 2"));

    const sense = value().pos[0]!.senses[0]!;
    expect(sense).toMatchObject({
      sub_pos: "countable",
      level: "B1",
      sense_group_id: "sense-group-2",
      frequency: "medium",
      depends_on_context: true,
      definitions: [
        expect.objectContaining({
          level: "B2",
          grammar_structure_id: "grammar-2"
        })
      ],
      sentences: [
        expect.objectContaining({
          level: "C1",
          links: [
            {
              word_id: "entry-1",
              sense_id: "sense-1",
              role: "focus"
            },
            {
              word_id: "entry-1",
              sense_id: "sense-2",
              role: "context"
            }
          ]
        })
      ],
      relations: [expect.objectContaining({ relation: "derivative" })]
    });
    fireEvent.mouseDown(screen.getByLabelText("例句 1 上下文关联 2 目标"));
    fireEvent.click(screen.getByText("词性 1 · 释义 3"));
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links[1]).toEqual({
      word_id: "entry-1",
      sense_id: "sense-3",
      role: "context"
    });
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="删除例句 1 的上下文关联 2"]'
      )!
    );
    expect(value().pos[0]!.senses[0]!.sentences[0]!.links).toEqual([
      { word_id: "entry-1", sense_id: "sense-1", role: "focus" }
    ]);
  });

  it("用中文业务标签呈现词性和引用选择，不暴露内部代码或 ID", () => {
    const forms: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
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

    expect(screen.getByRole("tab", { name: "名词" })).toBeInTheDocument();
    expect(screen.getByText("可数名词")).toBeInTheDocument();
    expect(screen.getByText("核心")).toBeInTheDocument();
    expect(screen.getAllByText("语法结构 1")).toHaveLength(2);
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

  it("单项列表移动按钮禁用，删除末个 POS 不错误切换，保存态禁用提交", () => {
    const { container } = render(<Harness />);
    for (const label of [
      "上移释义组 1",
      "下移释义组 1",
      "上移语法结构 1",
      "下移语法结构 1",
      "上移释义 1",
      "下移释义 1",
      "上移定义 1",
      "下移定义 1",
      "上移例句 1",
      "下移例句 1",
      "上移关联 1",
      "下移关联 1"
    ]) {
      expect(
        container.querySelector<HTMLButtonElement>(
          `button[aria-label="${label}"]`
        )
      ).toBeDisabled();
    }
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="删除词性 1的释义"]'
      )!
    );
    expect(value().pos).toEqual([]);

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
      ["保存草稿", "完成此步"].includes(button.textContent ?? "")
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
        ["保存草稿", "完成此步"].includes(button.textContent ?? "")
      )
    ).toBe(false);
  });

  it("无释义组时新增 sense 不产生缺失引用；删除首 POS 切换到下一 POS", () => {
    const emptyNested: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [],
      pos: [{ pos_id: "pos-1", grammar_structures: [], senses: [] }]
    };
    const { container } = render(
      <Harness idFactory={() => "sense-without-group"} initial={emptyNested} />
    );
    fireEvent.click(screen.getByText("新增释义"));
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
    const onChange = vi.fn();
    const onActivePosChange = vi.fn();
    const { container: twoPosContainer } = render(
      <AntApp>
        <V3MeaningsAndExamplesStep
          activePosId="pos-1"
          onActivePosChange={onActivePosChange}
          onChange={onChange}
          value={twoPos}
        />
      </AntApp>
    );
    fireEvent.click(
      twoPosContainer.querySelector<HTMLButtonElement>(
        'button[aria-label="删除词性 1的释义"]'
      )!
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        pos: [expect.objectContaining({ pos_id: "pos-2" })]
      })
    );
    expect(onActivePosChange).toHaveBeenCalledWith("pos-2");
  });

  it.each(["save", "complete"] as const)(
    "%s 只把当前 writable draft 交给 T5A action",
    async (intent) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<Harness onSave={onSave} />);
      fireEvent.change(screen.getByLabelText("释义 1 频率"), {
        target: { value: "low" }
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: intent === "save" ? "保存草稿" : "完成此步"
        })
      );

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          pos: [
            expect.objectContaining({
              senses: [expect.objectContaining({ frequency: "low" })]
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
      target: { value: "local-unsaved" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(
      await screen.findByDisplayValue("local-unsaved")
    ).toBeInTheDocument();

    const canonical = structuredClone(initial);
    canonical.pos[0]!.senses[0]!.frequency = "server-canonical";
    rerender(
      <AntApp>
        <V3MeaningsAndExamplesStep
          onChange={() => undefined}
          onSave={vi.fn().mockResolvedValue(undefined)}
          value={canonical}
        />
      </AntApp>
    );
    expect(screen.getByLabelText("释义 1 频率")).toHaveValue(
      "server-canonical"
    );
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
    expect(screen.getByText("第二词性的释义无效")).toBeInTheDocument();
  });
});
