import type {
  LinkedSentenceAssociationV1,
  PendingSentenceAssociationV1,
  SharedWordSentenceV1
} from "./sentenceAssociationTypes";
import type {
  DraftMeaningsStepContent,
  SaveMeaningsStepInput
} from "@tsz/types";
import { describe, expect, expectTypeOf, it } from "vitest";
import { wordFixture } from "../wordCreation.test.helper";
import { toMeaningsWireContent } from "../model";
import {
  addSentenceAssociation,
  canonicalSharedSentences,
  deriveSharedSentencesForSense,
  normalizePendingWord,
  normalizeSentenceAssociations,
  pendingAssociationKey,
  prepareSharedSentenceTextChange,
  renderSharedSentence,
  resolveSentenceAssociationFromWord,
  selectionToSourceRange,
  sharedSentenceIssueField
} from "./sentenceAssociationModel";
import type { DraftMeaningsWithSentenceAssociations } from "./sentenceAssociationTypes";

const richText = (text: string) => ({
  version: 1 as const,
  text,
  spans: [],
  liaisons: []
});

function pending(
  id: string,
  sentenceId = "sentence-1",
  start = 19,
  end = 21,
  word = "on"
): PendingSentenceAssociationV1 & { sentence_id?: string } {
  return {
    id,
    state: "pending",
    source_range: { start, end, surface: word },
    pending_word: word,
    normalized_pending_word: normalizePendingWord(word),
    ...(sentenceId ? { sentence_id: sentenceId } : {})
  };
}

function linked(
  id: string,
  start: number,
  end: number,
  surface: string,
  targetSenseId = "sense-center"
): LinkedSentenceAssociationV1 {
  return {
    id,
    state: "linked",
    source_range: { start, end, surface },
    target_word_id: "word-center",
    target_sense_id: targetSenseId,
    form_slot_id: `slot-${id}`,
    sort_order: 0
  };
}

function sharedSentence(
  associations: SharedWordSentenceV1["associations"] = []
): SharedWordSentenceV1 {
  return {
    id: "sentence-1",
    level: "A1",
    en_text_id: "sentence-1-en",
    en_text: richText("Center the picture on the wall."),
    zh_text_id: "sentence-1-zh",
    zh_text: richText("把画挂在墙壁中央。"),
    associations
  };
}

describe("sentenceAssociationModel — Unicode 位置", () => {
  it("把 ASCII UTF-16 selection 转成 Unicode code point 半开区间", () => {
    expect(
      selectionToSourceRange("Center the picture on the wall.", 19, 21)
    ).toEqual({
      ok: true,
      range: { start: 19, end: 21, surface: "on" }
    });
  });

  it("emoji 前缀不会让位置偏移", () => {
    expect(selectionToSourceRange("😀 Center", 3, 9)).toEqual({
      ok: true,
      range: { start: 2, end: 8, surface: "Center" }
    });
  });

  it("相同单词的两个位置保持不同，撇号和连字符属于单词内部", () => {
    expect(selectionToSourceRange("on on", 0, 2)).toMatchObject({
      ok: true,
      range: { start: 0, end: 2 }
    });
    expect(selectionToSourceRange("on on", 3, 5)).toMatchObject({
      ok: true,
      range: { start: 3, end: 5 }
    });
    expect(selectionToSourceRange("it's well-known", 0, 4)).toMatchObject({
      ok: true
    });
    expect(selectionToSourceRange("it's well-known", 5, 15)).toMatchObject({
      ok: true
    });
  });

  it.each([
    ["Center", 0, 0, "请选择一个单词"],
    [" on ", 0, 4, "选区不能包含首尾空白"],
    ["two words", 0, 9, "一期只支持连续的单个英文单词"],
    ["Center", 1, 6, "请选择完整的英文单词"],
    ["it's", 0, 2, "请选择完整的英文单词"],
    ["😀", 1, 2, "选区边界不能切开 Unicode 字符"],
    ["on", -1, 2, "选区超出原文范围"]
  ])("拒绝非法选区 %#", (text, start, end, error) => {
    expect(selectionToSourceRange(text, start, end)).toEqual({
      ok: false,
      error
    });
  });
});

describe("sentenceAssociationModel — 去重与共享", () => {
  it("规范化 pending word 并生成稳定业务键", () => {
    expect(normalizePendingWord("  It’s  ")).toBe("it's");
    expect(normalizePendingWord("WELL‑KNOWN")).toBe("well-known");
    expect(
      pendingAssociationKey("sentence-1", {
        ...pending("p-1"),
        pending_word: " ON ",
        normalized_pending_word: undefined
      })
    ).toBe("sentence-1\u000019:21\u0000on");
  });

  it("同一 pending 只添加一次，同一位置不能同时 linked/pending", () => {
    const first = pending("p-1");
    expect(addSentenceAssociation("sentence-1", [], first)).toEqual({
      status: "added",
      associations: [first]
    });
    expect(
      addSentenceAssociation("sentence-1", [first], pending("p-2"))
    ).toEqual({
      status: "duplicate",
      associations: [first]
    });
    expect(
      addSentenceAssociation("sentence-1", [first], linked("l-1", 19, 21, "on"))
    ).toEqual({ status: "position_conflict", associations: [first] });
    expect(
      addSentenceAssociation(
        "sentence-1",
        [linked("l-wide", 0, 6, "Center")],
        linked("l-overlap", 1, 6, "enter")
      )
    ).toMatchObject({ status: "position_conflict" });
  });

  it("不同句或同句不同位置不会误去重", () => {
    const associations = normalizeSentenceAssociations("sentence-1", [
      pending("p-1", "sentence-1", 0, 2),
      pending("p-2", "sentence-1", 3, 5)
    ]);
    expect(associations).toHaveLength(2);
    expect(
      pendingAssociationKey(
        "sentence-1",
        associations[0] as PendingSentenceAssociationV1
      )
    ).not.toBe(
      pendingAssociationKey(
        "sentence-2",
        associations[0] as PendingSentenceAssociationV1
      )
    );
    expect(
      new Set(
        ["sentence-1", "sentence-2", "sentence-3"].map((sentenceId) =>
          pendingAssociationKey(
            sentenceId,
            associations[0] as PendingSentenceAssociationV1
          )
        )
      ).size
    ).toBe(3);
  });

  it("共享正文只存一次，按 sense 派生时同一句只出现一次", () => {
    const sentence = sharedSentence([
      linked("l-1", 0, 6, "Center"),
      linked("l-2", 0, 6, "Center"),
      linked("l-3", 11, 18, "picture", "sense-picture")
    ]);
    expect(deriveSharedSentencesForSense([sentence], "sense-center")).toEqual([
      sentence
    ]);
    expect(deriveSharedSentencesForSense([sentence], "sense-picture")).toEqual([
      sentence
    ]);
    expect(deriveSharedSentencesForSense([sentence], "sense-missing")).toEqual(
      []
    );

    const awaitingPosition = sharedSentence([
      {
        id: "legacy-owner",
        state: "legacy_unpositioned",
        target_word_id: "word-center",
        target_sense_id: "sense-center",
        legacy_role: "focus",
        sort_order: 0
      }
    ]);
    expect(
      deriveSharedSentencesForSense([awaitingPosition], "sense-center")
    ).toEqual([awaitingPosition]);
  });
});

describe("sentenceAssociationModel — 预览、改文与 wire", () => {
  it("admin 私有草案不放宽正式 meanings/save wire 类型", () => {
    expectTypeOf<DraftMeaningsStepContent>().not.toHaveProperty(
      "shared_sentences"
    );
    expectTypeOf<SaveMeaningsStepInput["content"]>().not.toHaveProperty(
      "shared_sentences"
    );
    expectTypeOf<DraftMeaningsWithSentenceAssociations>().toHaveProperty(
      "shared_sentences"
    );
  });

  it("共享例句完成校验接受合法 linked/pending，拒绝空内容和冲突位置", () => {
    const valid = sharedSentence([
      linked("l-center", 0, 6, "Center"),
      pending("p-on")
    ]);
    expect(sharedSentenceIssueField(valid)).toBeUndefined();
    expect(sharedSentenceIssueField({ ...valid, en_text: richText(" ") })).toBe(
      "en_text"
    );
    expect(sharedSentenceIssueField(sharedSentence([]))).toBe("associations");
    expect(
      sharedSentenceIssueField(
        sharedSentence([
          linked("l-center", 0, 6, "Center"),
          pending("p-center", "sentence-1", 0, 6, "Center")
        ])
      )
    ).toBe("associations");
    expect(
      sharedSentenceIssueField(
        sharedSentence([
          {
            id: "legacy-center",
            state: "legacy_unpositioned",
            target_word_id: "word-center",
            target_sense_id: "sense-center",
            legacy_role: "focus",
            sort_order: 0
          }
        ])
      )
    ).toBeUndefined();
  });

  it("方言精确匹配优先、common 回退，缺失时保留 surface", () => {
    const sentence = sharedSentence([
      {
        ...linked("l-center", 0, 6, "Center"),
        form_variants: [
          { dialect: "uk", spelling: "Centre" },
          { dialect: "us", spelling: "Center" }
        ]
      },
      {
        ...linked("l-wall", 26, 30, "wall", "sense-wall"),
        form_variants: [{ dialect: "common", spelling: "wall" }]
      },
      linked("l-on", 19, 21, "on", "sense-on")
    ]);
    expect(renderSharedSentence(sentence, "uk")).toEqual({
      text: "Centre the picture on the wall.",
      missing_association_ids: ["l-on"]
    });
    expect(renderSharedSentence(sentence, "us").text).toBe(
      "Center the picture on the wall."
    );
  });

  it("英文变化清除所有 positioned 关联并保留待重标建议", () => {
    const sentence = sharedSentence([
      linked("l-1", 0, 6, "Center"),
      pending("p-1")
    ]);
    const changed = prepareSharedSentenceTextChange(
      sentence,
      "Place the picture on the wall."
    );
    expect(changed.affected).toEqual({ linked: 1, pending: 1 });
    expect(changed.sentence.en_text.text).toBe(
      "Place the picture on the wall."
    );
    expect(changed.sentence.associations).toEqual([]);
    expect(changed.reannotation_suggestions.map((item) => item.id)).toEqual([
      "l-1",
      "p-1"
    ]);

    const versionTwo = {
      ...sentence,
      en_text: {
        version: 2 as const,
        text: sentence.en_text.text,
        annotations: []
      }
    };
    expect(
      prepareSharedSentenceTextChange(versionTwo, "Move the picture.").sentence
        .en_text
    ).toEqual({ version: 2, text: "Move the picture.", annotations: [] });

    const metadataOnly = {
      ...sentence,
      level: "B1" as const,
      zh_text: richText("只修改译文。")
    };
    expect(
      prepareSharedSentenceTextChange(metadataOnly, sentence.en_text.text)
    ).toEqual({
      sentence: metadataOnly,
      affected: { linked: 0, pending: 0 },
      reannotation_suggestions: []
    });
  });

  it("只读投影、规范化值和审计字段不会进入 canonical 保存输入", () => {
    const sentence = sharedSentence([
      {
        ...linked("l-1", 0, 6, "Center"),
        resolved_pos: "noun",
        resolved_form_type: "base",
        target_headword: "center",
        target_gloss: "中心",
        form_variants: [{ dialect: "uk", spelling: "centre" }]
      },
      {
        ...pending("p-1"),
        normalized_pending_word: "on",
        created_by: "admin-1",
        created_at: "2026-08-22T00:00:00Z"
      }
    ]);
    expect(canonicalSharedSentences([sentence])).toEqual([
      {
        ...sentence,
        associations: [
          linked("l-1", 0, 6, "Center"),
          {
            id: "p-1",
            state: "pending",
            source_range: { start: 19, end: 21, surface: "on" },
            pending_word: "on"
          }
        ]
      }
    ]);
  });

  it("真实能力关闭时不发送 shared_sentences，mock 能力开启时只发 canonical 字段", () => {
    const shared = sharedSentence([
      {
        ...linked("l-1", 0, 6, "Center"),
        target_headword: "center",
        form_variants: [{ dialect: "uk", spelling: "centre" }]
      }
    ]);
    const content = { sense_groups: [], pos: [], shared_sentences: [shared] };
    expect(toMeaningsWireContent(content, "uk")).toEqual({
      sense_groups: [],
      pos: []
    });
    expect(toMeaningsWireContent(content, "uk", true)).toEqual({
      sense_groups: [],
      pos: [],
      shared_sentences: [
        {
          ...shared,
          associations: [linked("l-1", 0, 6, "Center")]
        }
      ]
    });
  });
});

describe("sentenceAssociationModel — form resolver", () => {
  it("唯一、歧义和不匹配三态都来自已发布词形事实", () => {
    const word = wordFixture({ status: "published", ready: true });
    const pos = word.forms.pos[0]!;
    const sense = word.meanings.pos[0]!.senses[0]!;
    pos.base_form.variants = [
      {
        id: "variant-center",
        dialect: "us",
        spelling: "center",
        origin: "dictionary",
        pronunciations: []
      }
    ];
    pos.form_groups = [];
    const input = {
      en_text: richText("Center it."),
      source_range: { start: 0, end: 6, surface: "Center" },
      target_word_id: word.id,
      target_sense_id: sense.id
    };
    expect(resolveSentenceAssociationFromWord(input, word)).toMatchObject({
      resolution: "resolved",
      candidate: { form_slot_id: pos.base_form.id, form_type: "base" }
    });

    pos.form_groups = [
      {
        id: "group-ambiguous",
        is_regular: false,
        slots: [
          {
            id: "slot-ambiguous",
            form_type: "past_tense",
            variants: [
              {
                id: "variant-ambiguous",
                dialect: "common",
                spelling: "center",
                origin: "manual",
                pronunciations: []
              }
            ]
          }
        ]
      }
    ];
    expect(resolveSentenceAssociationFromWord(input, word)).toMatchObject({
      resolution: "ambiguous",
      candidates: [{ form_type: "base" }, { form_type: "past_tense" }]
    });
    expect(
      resolveSentenceAssociationFromWord(
        {
          ...input,
          en_text: richText("Unknown."),
          source_range: { start: 0, end: 7, surface: "Unknown" }
        },
        word
      )
    ).toEqual({ resolution: "unmatched", candidates: [] });
  });
});
