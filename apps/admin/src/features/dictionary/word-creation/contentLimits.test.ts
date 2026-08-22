import { describe, expect, it } from "vitest";
import type {
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  EnglishTextV2,
  RichText,
  RichTextV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import type { DraftMeaningsWithSentenceAssociations } from "./meaningsAndExamples/sentenceAssociationTypes";
import {
  MAX_ENTRY_CONTENT_NODES,
  PAYLOAD_TOO_LARGE_MESSAGE,
  STEP_CONTENT_BODY_LIMIT,
  entryContentNodeIssue,
  formsContentNodeCount,
  meaningsContentLimitIssues,
  meaningsContentNodeCount,
  payloadTooLargeMessage,
  stepContentBodyIssue,
  stepContentByteSize
} from "./contentLimits";

function rt(text: string): RichText {
  return { version: 1, text, spans: [], liaisons: [] };
}

function unified(text: string, id = "tv"): EnglishTextV2 {
  return { mode: "unified", common: { id, value: rt(text), origin: "manual" } };
}

function distinguish(uk: string, us?: string): EnglishTextV2 {
  return {
    mode: "distinguish",
    source_dialect: "uk",
    uk: {
      state: "ready",
      variant: { id: "tv-uk", value: rt(uk), origin: "manual" }
    },
    us:
      us === undefined
        ? { state: "missing" }
        : {
            state: "ready",
            variant: { id: "tv-us", value: rt(us), origin: "manual" }
          }
  };
}

const LONG = "x".repeat(5001);

function meanings(
  overrides: Partial<DraftMeaningsStepContent["pos"][number]> = {},
  posCount = 1
): DraftMeaningsWithSentenceAssociations {
  return {
    sense_groups: [{ id: "g1", name_zh: "区间", name_en: "Range" }],
    pos: Array.from({ length: posCount }, (_, index) => ({
      pos_id: `p${index + 1}`,
      grammar_structures: [],
      senses: [],
      ...overrides
    }))
  };
}

function senseWith(
  parts: Partial<DraftMeaningsStepContent["pos"][number]["senses"][number]>
): DraftMeaningsStepContent["pos"][number]["senses"][number] {
  return {
    id: "s1",
    sub_pos: "N-COUNT",
    level: "A1",
    sense_group_id: "g1",
    depends_on_context: false,
    definitions: [],
    sentences: [],
    relations: [],
    ...parts
  };
}

describe("meaningsContentLimitIssues", () => {
  it("语法结构超长时指名第几条、哪一侧方言、超了多少", () => {
    const issues = meaningsContentLimitIssues(
      meanings({
        grammar_structures: [
          {
            id: "gs1",
            variants: [{ id: "gv1", dialect: "common", content: rt("ok") }]
          },
          {
            id: "gs2",
            variants: [{ id: "gv2", dialect: "uk", content: rt(LONG) }]
          }
        ]
      })
    );
    expect(issues).toEqual([
      {
        node_id: "gs2",
        field: "content",
        message:
          "语法结构 2（英式）：正文 5001 个字符，超出上限 5000，请删减 1 个字符"
      }
    ]);
  });

  it("中文释义与英文释义都拦，英文按已就绪的方言逐份计", () => {
    const issues = meaningsContentLimitIssues(
      meanings({
        senses: [
          senseWith({
            definitions: [
              {
                id: "d1",
                level: "A1",
                definition_mode: "zh_definition",
                content_id: "dc1",
                content: rt(LONG)
              },
              {
                id: "d2",
                level: "A1",
                definition_mode: "en_definition",
                content: distinguish(LONG, LONG)
              },
              {
                id: "d3",
                level: "A1",
                definition_mode: "en_definition",
                // us 尚未就绪:未就绪的槽位不发出去,也就不该被校验。
                content: distinguish(LONG)
              }
            ]
          })
        ]
      })
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      "词义 1 · 释义 1：正文 5001 个字符，超出上限 5000，请删减 1 个字符",
      "词义 1 · 释义 2（英式）：正文 5001 个字符，超出上限 5000，请删减 1 个字符",
      "词义 1 · 释义 2（美式）：正文 5001 个字符，超出上限 5000，请删减 1 个字符",
      "词义 1 · 释义 3（英式）：正文 5001 个字符，超出上限 5000，请删减 1 个字符"
    ]);
    expect(issues.map((issue) => issue.node_id)).toEqual([
      "d1",
      "d2",
      "d2",
      "d3"
    ]);
  });

  it("例句的英文与汉语译文分别定位到 sentence / zh_text", () => {
    const issues = meaningsContentLimitIssues(
      meanings({
        senses: [
          senseWith({
            sentences: [
              {
                id: "st1",
                level: "A1",
                en_text: unified(LONG),
                zh_text_id: "zt1",
                zh_text: rt(LONG),
                links: []
              }
            ]
          })
        ]
      })
    );
    expect(issues).toEqual([
      {
        node_id: "st1",
        field: "sentence",
        message:
          "词义 1 · 例句 1英文：正文 5001 个字符，超出上限 5000，请删减 1 个字符"
      },
      {
        node_id: "st1",
        field: "zh_text",
        message:
          "词义 1 · 例句 1汉语译文：正文 5001 个字符，超出上限 5000，请删减 1 个字符"
      }
    ]);
  });

  it("共享例句正文只校验一次，不随关联词义数量重复", () => {
    const content = meanings();
    content.shared_sentences = [
      {
        id: "shared-1",
        level: "A1",
        en_text_id: "shared-1-en",
        en_text: rt(LONG),
        zh_text_id: "shared-1-zh",
        zh_text: rt(LONG),
        associations: [
          {
            id: "linked-1",
            state: "linked",
            source_range: { start: 0, end: 1, surface: "x" },
            target_word_id: "word-1",
            target_sense_id: "sense-1",
            form_slot_id: "slot-1",
            sort_order: 0
          },
          {
            id: "linked-2",
            state: "linked",
            source_range: { start: 1, end: 2, surface: "x" },
            target_word_id: "word-2",
            target_sense_id: "sense-2",
            form_slot_id: "slot-2",
            sort_order: 0
          }
        ]
      }
    ];
    expect(meaningsContentLimitIssues(content)).toEqual([
      {
        node_id: "shared-1",
        field: "sentence",
        message:
          "多维例句 1英文：正文 5001 个字符，超出上限 5000，请删减 1 个字符"
      },
      {
        node_id: "shared-1",
        field: "zh_text",
        message:
          "多维例句 1汉语译文：正文 5001 个字符，超出上限 5000，请删减 1 个字符"
      }
    ]);
  });

  it("多个词性时提示带上词性序号，单个词性时不带", () => {
    const grammar = {
      grammar_structures: [
        {
          id: "gs1",
          variants: [
            { id: "gv1", dialect: "common" as const, content: rt(LONG) }
          ]
        }
      ]
    };
    expect(meaningsContentLimitIssues(meanings(grammar))[0]!.message).toMatch(
      /^语法结构 1：/
    );
    const multi = meaningsContentLimitIssues(meanings(grammar, 2));
    expect(multi.map((issue) => issue.message.split("：")[0])).toEqual([
      "词性 1 · 语法结构 1",
      "词性 2 · 语法结构 1"
    ]);
  });

  it("V2 富文本的标注数与 IPA 同样在保存路径上拦", () => {
    const value: RichTextV2 = {
      version: 2,
      text: "ab",
      annotations: [
        { type: "phoneme", start: 0, end: 1, alphabet: "ipa", phoneme: " " }
      ]
    };
    const issues = meaningsContentLimitIssues(
      meanings({
        senses: [
          senseWith({
            definitions: [
              {
                id: "d1",
                level: "A1",
                definition_mode: "zh_definition",
                content_id: "dc1",
                content: value
              }
            ]
          })
        ]
      })
    );
    expect(issues).toEqual([
      {
        node_id: "d1",
        field: "content",
        message: "词义 1 · 释义 1：第 1 个 IPA 标注为空，请填写音素或删除该标注"
      }
    ]);
  });

  it("内容都在限内时没有任何提示", () => {
    expect(
      meaningsContentLimitIssues(
        meanings({
          grammar_structures: [
            {
              id: "gs1",
              variants: [{ id: "gv1", dialect: "common", content: rt("ok") }]
            }
          ],
          senses: [
            senseWith({
              definitions: [
                {
                  id: "d1",
                  level: "A1",
                  definition_mode: "en_definition",
                  content: unified("fine")
                }
              ],
              sentences: [
                {
                  id: "st1",
                  level: "A1",
                  en_text: unified("fine"),
                  zh_text_id: "zt1",
                  zh_text: rt("没问题"),
                  links: []
                }
              ]
            })
          ]
        })
      )
    ).toEqual([]);
  });
});

describe("节点数", () => {
  const forms: DraftFormsStepContent = {
    pos: [
      {
        pos_id: "p1",
        pos: "noun",
        dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
        base_form: {
          id: "bf1",
          form_type: "base",
          variants: [
            {
              id: "bv1",
              dialect: "common",
              spelling: "cat",
              origin: "manual",
              pronunciations: [
                {
                  id: "pr1",
                  dict_phonetic: "kæt",
                  actual_pron: "kæt",
                  style: "normal"
                }
              ]
            }
          ]
        },
        form_groups: [
          {
            id: "fg1",
            is_regular: true,
            slots: [
              {
                id: "ds1",
                form_type: "plural",
                variants: [
                  {
                    id: "dv1",
                    dialect: "common",
                    spelling: "cats",
                    origin: "manual",
                    pronunciations: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  it("forms 侧按 pos / 槽位 / 变体 / 读音逐个计", () => {
    // pos 1 + 原形槽位 1 + 原形变体 1 + 读音 1 + 词形组 1 + 派生槽位 1 + 派生变体 1
    expect(formsContentNodeCount(forms)).toBe(7);
    expect(formsContentNodeCount({ pos: [] })).toBe(0);
  });

  it("meanings 侧按语义区间 / 语法 / 词义 / 释义 / 例句 / 关系逐个计", () => {
    const content = meanings({
      grammar_structures: [
        {
          id: "gs1",
          variants: [{ id: "gv1", dialect: "common", content: rt("ok") }]
        }
      ],
      senses: [
        senseWith({
          definitions: [
            {
              id: "d1",
              level: "A1",
              definition_mode: "zh_definition",
              content_id: "dc1",
              content: rt("中文")
            },
            {
              id: "d2",
              level: "A1",
              definition_mode: "en_definition",
              content: unified("en")
            }
          ],
          sentences: [
            {
              id: "st1",
              level: "A1",
              en_text: unified("hi"),
              zh_text_id: "zt1",
              zh_text: rt("你好"),
              links: []
            }
          ],
          relations: [
            {
              id: "r1",
              relation: "synonym",
              target_word_id: "w1",
              target_sense_id: "s2",
              score: "50"
            }
          ]
        })
      ]
    });
    // 区间 1 + 语法 2 + 词义 1 + 关系 1 + 释义 2+2 + 例句 3
    expect(meaningsContentNodeCount(content)).toBe(12);
  });

  it("共享例句正文只计一次，位置关联按稳定身份计数", () => {
    const content = meanings();
    content.shared_sentences = [
      {
        id: "shared-1",
        level: "A1",
        en_text_id: "shared-1-en",
        en_text: rt("one sentence"),
        zh_text_id: "shared-1-zh",
        zh_text: rt("一个例句"),
        associations: [
          {
            id: "pending-1",
            state: "pending",
            source_range: { start: 0, end: 3, surface: "one" },
            pending_word: "one"
          },
          {
            id: "pending-2",
            state: "pending",
            source_range: { start: 4, end: 12, surface: "sentence" },
            pending_word: "sentence"
          }
        ]
      }
    ];
    // 语义区间 1 + shared sentence/en/zh 3 + association 2。
    expect(meaningsContentNodeCount(content)).toBe(6);
  });

  it("按 forms + meanings 合计判定，恰好等于上限放行", () => {
    const atLimit: DraftMeaningsStepContent = {
      sense_groups: Array.from(
        { length: MAX_ENTRY_CONTENT_NODES - 7 },
        (_, index) => ({
          id: `g${index}`,
          name_zh: "",
          name_en: ""
        })
      ),
      pos: []
    };
    expect(entryContentNodeIssue(forms, atLimit)).toBeUndefined();
    expect(
      entryContentNodeIssue(forms, {
        ...atLimit,
        sense_groups: [
          ...atLimit.sense_groups,
          { id: "extra", name_zh: "", name_en: "" }
        ]
      })
    ).toBe(
      "本词条共 2001 个内容节点（词形 7 + 词义 1994），超出单个词条上限 2000，" +
        "请删减 1 个节点（词义、例句或派生词形）后再保存"
    );
  });
});

describe("请求体字节数", () => {
  it("上限是 8,192,000 而不是 8 MiB", () => {
    expect(STEP_CONTENT_BODY_LIMIT).toBe(8_192_000);
    expect(STEP_CONTENT_BODY_LIMIT).not.toBe(8 * 1024 * 1024);
  });

  it("量的是序列化后的字节数，不是字符数", () => {
    // 中文一个字 3 字节:按 length 量会少算三分之二。
    expect(stepContentByteSize({ t: "中文" })).toBe(14);
  });

  it("恰好等于上限放行，超一个字节就地拦下", () => {
    const overhead = stepContentByteSize({ t: "" });
    const atLimit = { t: "a".repeat(STEP_CONTENT_BODY_LIMIT - overhead) };
    expect(stepContentByteSize(atLimit)).toBe(STEP_CONTENT_BODY_LIMIT);
    expect(stepContentBodyIssue(atLimit)).toBeUndefined();
    expect(stepContentBodyIssue({ t: `${atLimit.t}a` })).toBe(
      "本次提交 8192001 字节（约 7.81 MB），超出单步保存上限 8192000 字节，" +
        "需删减 1 字节后分次保存"
    );
  });
});

describe("payloadTooLargeMessage", () => {
  it("413 或 payload_too_large 都识别为内容过大", () => {
    expect(payloadTooLargeMessage(new HttpError(413, "too large"))).toBe(
      PAYLOAD_TOO_LARGE_MESSAGE
    );
    expect(
      payloadTooLargeMessage(
        new HttpError(413, "too large", [], "payload_too_large")
      )
    ).toBe(PAYLOAD_TOO_LARGE_MESSAGE);
  });

  it("其余错误不走这条分支", () => {
    expect(
      payloadTooLargeMessage(
        new HttpError(422, "bad", [], "invalid_request_body")
      )
    ).toBeUndefined();
    expect(payloadTooLargeMessage(new Error("boom"))).toBeUndefined();
    expect(payloadTooLargeMessage(undefined)).toBeUndefined();
  });
});
