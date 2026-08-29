import type { EnglishTextV2 } from "@tsz/types";
import type {
  AdminWordV2,
  DraftMeaningsStepContent,
  GrammarStructureV2,
  RichText,
  WordHeadwordsV2,
  WordDefinitionV2,
  WordPosFormsV2,
  WordPosMeaningsV2,
  WordRelationV2,
  WordFormType
} from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  cefrRank,
  collapseEnglishText,
  collapseMeaningsEnglishText,
  countDiscardedEnglishTexts,
  createDefinition,
  createDerivedSlot,
  createEnglishText,
  createFormGroup,
  createGrammar,
  createPosForms,
  createPosMeanings,
  createPronunciation,
  createRelation,
  createSense,
  createSentence,
  defaultDerivedFormType,
  dialectHeadword,
  ensureMeaningsForForms,
  formDialects,
  legalDerivedFormTypes,
  collapseGrammarStructure,
  collapseMeaningsGrammar,
  countDiscardedGrammarVariants,
  resolveGrammarText,
  writeGrammarText,
  hasDialectSplitEnglishText,
  resolveEnglishText,
  toFormsWireContent,
  toMeaningsWireContent,
  updateRichText,
  orderedHeadwordSpellings,
  wordDisplayHeadword,
  writeEnglishText
} from "./model";

describe("词性派生词形能力", () => {
  const capabilityCases: Array<[string, Array<Exclude<WordFormType, "base">>]> =
    [
      ["noun", ["plural"]],
      [
        "verb",
        [
          "third_person_singular",
          "present_participle",
          "past_tense",
          "past_participle"
        ]
      ],
      ["adjective", ["comparative", "superlative"]],
      ["adverb", ["comparative", "superlative"]],
      ["preposition", []]
    ];

  it.each(capabilityCases)(
    "%s 仅开放后端配置的合法词形并给出稳定默认顺序",
    (pos, expected) => {
      expect(legalDerivedFormTypes(pos, expected)).toEqual(expected);
      expect(defaultDerivedFormType(pos, [], expected)).toBe(expected[0]);
    }
  );

  it("catalog 未下发候选时返回空集合", () => {
    expect(legalDerivedFormTypes("noun")).toEqual([]);
    expect(defaultDerivedFormType("verb", [])).toBeUndefined();
  });

  it("优先选择尚未录入的合法类型，全部齐全时不再生成重复类型", () => {
    expect(
      defaultDerivedFormType(
        "verb",
        ["third_person_singular"],
        [
          "third_person_singular",
          "present_participle",
          "past_tense",
          "past_participle"
        ]
      )
    ).toBe("present_participle");
    expect(
      defaultDerivedFormType(
        "adjective",
        ["comparative", "superlative"],
        ["comparative", "superlative"]
      )
    ).toBeUndefined();
  });
});

const unifiedHeadwords = {
  mode: "unified",
  common: "far"
} satisfies WordHeadwordsV2;

const distinguishedHeadwords = {
  mode: "distinguish",
  uk: "centre",
  us: "center",
  source_dialect: "us"
} satisfies WordHeadwordsV2;

function richText(text: string): RichText {
  return { version: 1, text, spans: [], liaisons: [] };
}

/** 存量（A1 改造前）的英美双份英文文本；新建流程不再产出这种形状。 */
function legacySplitEnglishText(
  id: string,
  usText: string,
  ukText?: string
): EnglishTextV2 {
  return {
    mode: "distinguish",
    source_dialect: "us",
    us: {
      state: "ready",
      variant: {
        id: `${id}-us-text`,
        value: richText(usText),
        origin: "manual"
      }
    },
    uk:
      ukText === undefined
        ? { state: "missing" }
        : {
            state: "ready",
            variant: {
              id: `${id}-uk-text`,
              value: richText(ukText),
              origin: "manual"
            }
          }
  };
}

/** 存量（A1 改造前）的英美双条语法结构；新建流程只产出单条 `common`。 */
function legacySplitGrammar(
  id: string,
  ukText: string,
  usText: string
): GrammarStructureV2 {
  return {
    id,
    variants: [
      { id: `${id}-uk`, dialect: "uk", content: richText(ukText) },
      { id: `${id}-us`, dialect: "us", content: richText(usText) }
    ]
  };
}

function englishDefinition(
  id: string,
  text: string,
  targetText?: string
): WordDefinitionV2 {
  return {
    id,
    level: "A1",
    definition_mode: "en_definition",
    content: legacySplitEnglishText(id, text, targetText)
  };
}

function dialectMeaningContent(): DraftMeaningsStepContent {
  const noun = createPosMeanings("noun-pos", "word-1", "sense-group-1");
  noun.grammar_structures = [
    legacySplitGrammar("noun-grammar", "grammar-uk", "grammar-us")
  ];
  noun.senses[0]!.definitions.push(
    englishDefinition("definition-missing", "the center"),
    englishDefinition("definition-ready", "the color", "the colour")
  );
  noun.senses[0]!.sentences[0]!.id = "example-missing";
  noun.senses[0]!.sentences[0]!.en_text = legacySplitEnglishText(
    "example-missing",
    "The center is closed."
  );

  const verb = createPosMeanings("verb-pos", "word-1", "sense-group-1");
  verb.senses[0]!.definitions.push(
    englishDefinition("definition-second-pos", "to organize")
  );

  return {
    sense_groups: [{ id: "sense-group-1", name_zh: "测试", name_en: "Test" }],
    pos: [noun, verb]
  };
}

function makeWord(
  forms: WordPosFormsV2[],
  meanings: WordPosMeaningsV2[],
  headwords: WordHeadwordsV2 = unifiedHeadwords
): AdminWordV2 {
  return {
    schema_version: 2,
    id: "word-1",
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    headwords,
    detection_snapshot: {
      detection_id: "detection-1",
      request: { language: "en", headword: "far" },
      normalized_headword: "far",
      entry_kind: "word",
      matched_dialect: "common",
      builtin_dictionary_status: "matched",
      smart_dictionary_status: "clear",
      headwords,
      suggested_pos: forms.map((entry) => entry.pos),
      detected_at: "2026-08-02T00:00:00Z"
    },
    forms: { pos: forms },
    meanings: {
      sense_groups: [
        { id: "sense-group-1", name_zh: "空间", name_en: "Space" }
      ],
      pos: meanings
    },
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: "admin-1",
    created_at: "2026-08-02T00:00:00Z",
    updated_at: "2026-08-02T00:00:00Z",
    has_unpublished_changes: false
  };
}

describe("T05 共享 base、方言规则与多词形组", () => {
  it("统一 headword 只生成词性级 common base，词形组不复制 base", () => {
    const pos = createPosForms("adjective", unifiedHeadwords);

    expect(pos.dialect_rules).toEqual({
      spelling_mode: "unified",
      phonetic_mode: "unified"
    });
    expect(pos.base_form.form_type).toBe("base");
    expect(pos.base_form.variants).toHaveLength(1);
    expect(pos.base_form.variants[0]).toMatchObject({
      dialect: "common",
      spelling: "far",
      origin: "manual"
    });
    expect(formDialects(pos)).toEqual(["common"]);
    expect(pos.form_groups).toHaveLength(1);
    expect(pos.form_groups[0]).not.toHaveProperty("base_form");
    expect(pos.form_groups[0]!.slots).toEqual([]);
  });

  it("区分 headword 锁定 UK/US base 拼写，并同步启用双方言规则", () => {
    const pos = createPosForms("noun", distinguishedHeadwords);

    expect(pos.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
    expect(
      pos.base_form.variants.map(({ dialect, spelling }) => ({
        dialect,
        spelling
      }))
    ).toEqual([
      { dialect: "uk", spelling: "centre" },
      { dialect: "us", spelling: "center" }
    ]);
    expect(formDialects(pos)).toEqual(["uk", "us"]);
  });

  it("仅音标区分时仍派生 UK/US variant", () => {
    const pos = createPosForms("adverb", unifiedHeadwords);
    pos.dialect_rules.phonetic_mode = "distinguish";

    expect(formDialects(pos)).toEqual(["uk", "us"]);
  });

  it("farther/further 可作为两个稳定组，共享 base 且不改写既有 ID/顺序", () => {
    const pos = createPosForms("adjective", unifiedHeadwords);
    const baseId = pos.base_form.id;
    const baseVariantId = pos.base_form.variants[0]!.id;
    const fartherGroup = pos.form_groups[0]!;
    const fartherSlot = createDerivedSlot("comparative", pos);
    fartherSlot.variants[0]!.spelling = "farther";
    fartherGroup.slots = [fartherSlot];

    const existingIds = {
      group: fartherGroup.id,
      slot: fartherSlot.id,
      variant: fartherSlot.variants[0]!.id
    };
    const furtherGroup = createFormGroup();
    const furtherSlot = createDerivedSlot("comparative", pos);
    furtherSlot.variants[0]!.spelling = "further";
    furtherGroup.slots = [furtherSlot];

    const next = { ...pos, form_groups: [...pos.form_groups, furtherGroup] };

    expect(next.base_form.id).toBe(baseId);
    expect(next.base_form.variants[0]).toMatchObject({
      id: baseVariantId,
      dialect: "common",
      spelling: "far"
    });
    expect(next.form_groups.map((group) => group.id)).toEqual([
      existingIds.group,
      furtherGroup.id
    ]);
    expect(next.form_groups[0]!.slots[0]).toMatchObject({
      id: existingIds.slot,
      form_type: "comparative",
      variants: [
        {
          id: existingIds.variant,
          dialect: "common",
          spelling: "farther"
        }
      ]
    });
    expect(next.form_groups[1]!.slots[0]).toMatchObject({
      id: furtherSlot.id,
      form_type: "comparative",
      variants: [{ dialect: "common", spelling: "further" }]
    });
    expect(next.form_groups.every((group) => !("base_form" in group))).toBe(
      true
    );
  });
});

describe("T09 EnglishText 单份化与 grammar 方言派生", () => {
  it("新建的英文文本恒为单份 common/manual，不再按主词分叉", () => {
    expect(createEnglishText("the far side")).toMatchObject({
      mode: "unified",
      common: {
        id: expect.any(String),
        origin: "manual",
        value: {
          version: 1,
          text: "the far side",
          spans: [],
          liaisons: []
        }
      }
    });
    expect(createEnglishText()).toMatchObject({
      mode: "unified",
      common: { value: { text: "" } }
    });
  });

  it("语法结构读兼容：取偏好侧，统一词条退回 common", () => {
    const legacy = legacySplitGrammar("g-1", "a centre", "the center");
    expect(resolveGrammarText(legacy, "uk").text).toBe("a centre");
    expect(resolveGrammarText(legacy, "us").text).toBe("the center");

    const unified = createGrammar();
    unified.variants[0]!.content = richText("the far side");
    expect(resolveGrammarText(unified, "uk").text).toBe("the far side");
  });

  it("语法结构写入只改当前口径那一条，形状不变", () => {
    const legacy = legacySplitGrammar("g-1", "a centre", "the center");
    const next = writeGrammarText(legacy, "uk", richText("an edited centre"));

    expect(next.variants).toHaveLength(2);
    expect(next.variants[0]).toMatchObject({
      id: legacy.variants[0]!.id,
      dialect: "uk",
      content: { text: "an edited centre" }
    });
    expect(next.variants[1]).toBe(legacy.variants[1]);
  });

  it("语法结构读写：既无偏好侧也无 common 时退回第一条，变体全空时不炸", () => {
    // 形状被外部改坏（只剩非偏好侧）时仍要能读能写，不能返回 undefined 或抛。
    const onlyOther: GrammarStructureV2 = {
      id: "g-broken",
      variants: [
        { id: "g-broken-us", dialect: "us", content: richText("the center") }
      ]
    };
    expect(resolveGrammarText(onlyOther, "uk").text).toBe("the center");
    expect(
      writeGrammarText(onlyOther, "uk", richText("edited")).variants[0]
    ).toMatchObject({ id: "g-broken-us", content: { text: "edited" } });

    const empty: GrammarStructureV2 = { id: "g-empty", variants: [] };
    expect(resolveGrammarText(empty, "uk").text).toBe("");
    expect(writeGrammarText(empty, "uk", richText("fresh")).variants).toEqual([
      { id: expect.any(String), dialect: "common", content: richText("fresh") }
    ]);
  });

  it("新建的语法结构恒为单条 common", () => {
    const grammar = createGrammar();
    expect(grammar.variants).toHaveLength(1);
    expect(grammar.variants[0]).toMatchObject({
      dialect: "common",
      content: { text: "" }
    });
    expect(grammar.variants[0]).not.toHaveProperty("state");
  });

  it("保存收敛：存量双条折成单条 common，内容取偏好侧且节点 ID 必须新起", () => {
    const legacy = legacySplitGrammar("g-1", "a centre", "the center");
    const collapsed = collapseGrammarStructure(legacy, "uk");

    expect(collapsed.id).toBe(legacy.id);
    expect(collapsed.variants).toHaveLength(1);
    expect(collapsed.variants[0]).toMatchObject({
      dialect: "common",
      content: { text: "a centre" }
    });
    // 沿用旧 uk 变体的 ID 只改 dialect 会被后端判 node_binding_changed（422）。
    expect(collapsed.variants[0]!.id).not.toBe(legacy.variants[0]!.id);
    expect(collapsed.variants[0]!.id).not.toBe(legacy.variants[1]!.id);

    // 偏好侧是美式时留下的是美式那一份。
    expect(collapseGrammarStructure(legacy, "us").variants[0]!.content).toEqual(
      richText("the center")
    );
  });

  it("已经是单条 common 的语法结构原样返回，不每次保存换新节点", () => {
    const grammar = createGrammar();
    grammar.variants[0]!.content = richText("a centre");
    expect(collapseGrammarStructure(grammar, "uk")).toBe(grammar);
  });

  it("统计收敛会丢弃的语法结构：空的或本来就相同的不计入", () => {
    const same = legacySplitGrammar("g-same", "a centre", "a centre");
    const differs = legacySplitGrammar("g-differs", "a centre", "the center");
    const emptyOther = legacySplitGrammar("g-empty", "a centre", "");
    const collapsed = createGrammar();
    collapsed.variants[0]!.content = richText("a centre");

    const content: DraftMeaningsStepContent = {
      sense_groups: [{ id: "g1", name_zh: "测试", name_en: "Test" }],
      pos: [
        {
          pos_id: "pos-1",
          grammar_structures: [same, differs, emptyOther, collapsed],
          senses: []
        }
      ]
    };
    expect(countDiscardedGrammarVariants(content, "uk")).toBe(1);
    // 偏好侧换成美式后，emptyOther 留下的是空的美式那一份，
    // 有内容的英式那条要被丢弃，于是多算一条。
    expect(countDiscardedGrammarVariants(content, "us")).toBe(2);
  });

  it("双份形状里根本没有非偏好侧那一条时不计入丢弃", () => {
    const noOtherSide: GrammarStructureV2 = {
      id: "g-no-us",
      variants: [
        { id: "g-no-us-uk", dialect: "uk", content: richText("a centre") },
        {
          id: "g-no-us-common",
          dialect: "common",
          content: richText("a centre")
        }
      ]
    };
    const content: DraftMeaningsStepContent = {
      sense_groups: [{ id: "g1", name_zh: "测试", name_en: "Test" }],
      pos: [{ pos_id: "pos-1", grammar_structures: [noOtherSide], senses: [] }]
    };
    expect(countDiscardedGrammarVariants(content, "uk")).toBe(0);
  });

  it("整页语法结构无双份形状时返回同一引用", () => {
    const clean: DraftMeaningsStepContent = {
      sense_groups: [{ id: "g1", name_zh: "测试", name_en: "Test" }],
      pos: [createPosMeanings("pos-1", "word-1", "g1")]
    };
    expect(collapseMeaningsGrammar(clean, "uk")).toBe(clean);
  });

  it("整页语法结构收敛只重建含双份的那些词性", () => {
    const legacyPos: WordPosMeaningsV2 = {
      ...createPosMeanings("pos-1", "word-1", "g1"),
      grammar_structures: [legacySplitGrammar("g-1", "a centre", "the center")]
    };
    const cleanPos = createPosMeanings("pos-2", "word-1", "g1");
    const content: DraftMeaningsStepContent = {
      sense_groups: [{ id: "g1", name_zh: "测试", name_en: "Test" }],
      pos: [legacyPos, cleanPos]
    };
    const next = collapseMeaningsGrammar(content, "uk");

    expect(next).not.toBe(content);
    expect(next.pos[1]).toBe(cleanPos);
    expect(
      next.pos[0]!.grammar_structures[0]!.variants.map((item) => item.dialect)
    ).toEqual(["common"]);
  });
});

describe("T10 meanings 与 focus link", () => {
  it("默认 sense 的例句恰好有一个指向当前 word/sense 的 focus link", () => {
    const sense = createSense("word-1", "sense-group-1");
    const sentence = sense.sentences[0]!;
    const focusLinks = sentence.links.filter((link) => link.role === "focus");

    expect(sense.definitions).toHaveLength(1);
    expect(sense.sense_group_id).toBe("sense-group-1");
    expect(sense.definitions[0]).toMatchObject({
      definition_mode: "zh_definition",
      level: "A1"
    });
    expect(focusLinks).toEqual([
      { word_id: "word-1", sense_id: sense.id, role: "focus" }
    ]);
    expect(sentence.links.filter((link) => link.role === "context")).toEqual(
      []
    );
  });

  it("ensureMeaningsForForms 按 forms 顺序保留同 pos_id 节点并补齐新增 POS", () => {
    const nounForms = createPosForms("noun", unifiedHeadwords);
    const verbForms = createPosForms("verb", unifiedHeadwords);
    const existingNoun = createPosMeanings(
      nounForms.pos_id,
      "word-1",
      "sense-group-1"
    );
    existingNoun.senses[0]!.sub_pos = "N-COUNT";
    const removedPos = createPosMeanings(
      "removed-pos",
      "word-1",
      "sense-group-1"
    );
    const word = makeWord([nounForms, verbForms], [removedPos, existingNoun]);
    const existingIds = {
      grammar: existingNoun.grammar_structures[0]!.id,
      sense: existingNoun.senses[0]!.id,
      sentence: existingNoun.senses[0]!.sentences[0]!.id
    };

    const result = ensureMeaningsForForms(word);

    expect(result.sense_groups).toBe(word.meanings.sense_groups);
    expect(result.pos.map((entry) => entry.pos_id)).toEqual([
      nounForms.pos_id,
      verbForms.pos_id
    ]);
    expect(result.pos[0]).toBe(existingNoun);
    expect(result.pos[0]!.grammar_structures[0]!.id).toBe(existingIds.grammar);
    expect(result.pos[0]!.senses[0]).toMatchObject({
      id: existingIds.sense,
      sub_pos: "N-COUNT",
      sentences: [{ id: existingIds.sentence }]
    });

    const createdVerb = result.pos[1]!;
    expect(createdVerb.pos_id).toBe(verbForms.pos_id);
    expect(createdVerb.grammar_structures).toHaveLength(1);
    expect(createdVerb.senses).toHaveLength(1);
    expect(
      createdVerb.senses[0]!.sentences[0]!.links.filter(
        (link) => link.role === "focus"
      )
    ).toEqual([
      {
        word_id: "word-1",
        sense_id: createdVerb.senses[0]!.id,
        role: "focus"
      }
    ]);
    expect(result.pos.some((entry) => entry.pos_id === "removed-pos")).toBe(
      false
    );
    expect(word.meanings.pos).toEqual([removedPos, existingNoun]);
  });

  it("meanings 为空时默认创建首个语义区间，并让新增 POS 的词义自动绑定", () => {
    const nounForms = createPosForms("noun", unifiedHeadwords);
    const word = makeWord([nounForms], []);
    word.meanings.sense_groups = [];

    const result = ensureMeaningsForForms(word);

    expect(result.sense_groups).toEqual([
      { id: expect.any(String), name_zh: "", name_en: "" }
    ]);
    expect(result.pos[0]!.senses[0]!.sense_group_id).toBe(
      result.sense_groups[0]!.id
    );
    expect(word.meanings.sense_groups).toEqual([]);
  });
});

describe("A1 英文内容读兼容与保存收敛", () => {
  it("读兼容：单份取 common，存量双份取偏好侧，偏好侧缺失时为空且不搬运另一侧", () => {
    const unified = createEnglishText("the far side");
    const legacy = legacySplitEnglishText("d1", "the color", "the colour");
    const onlyUs = legacySplitEnglishText("d2", "the center");

    expect(resolveEnglishText(unified, "uk").text).toBe("the far side");
    expect(resolveEnglishText(unified, "us").text).toBe("the far side");
    expect(resolveEnglishText(legacy, "uk").text).toBe("the colour");
    expect(resolveEnglishText(legacy, "us").text).toBe("the color");
    // 偏好英式但只有美式内容时给空框——搬运过来等于把美式内容冒充成英式的。
    expect(resolveEnglishText(onlyUs, "uk").text).toBe("");
  });

  it("写入只改当前口径那一份，wire 形状保持不变直到保存", () => {
    const unified = createEnglishText("old");
    const written = writeEnglishText(unified, "uk", richText("new"));
    expect(written).toMatchObject({
      mode: "unified",
      common: {
        id: unified.common.id,
        value: { text: "new" },
        origin: "manual"
      }
    });

    const legacy = legacySplitEnglishText("d1", "the color", "the colour");
    const edited = writeEnglishText(legacy, "uk", richText("the colour!"));
    expect(edited.mode).toBe("distinguish");
    if (edited.mode !== "distinguish") throw new Error("unreachable");
    expect(edited.uk).toMatchObject({
      state: "ready",
      variant: { id: "d1-uk-text", value: { text: "the colour!" } }
    });
    // 另一侧原样保留，好让保存前的确认框还数得出要丢几条。
    if (legacy.mode !== "distinguish") throw new Error("unreachable");
    expect(edited.us).toEqual(legacy.us);
  });

  it("写入偏好侧缺失的存量文本时补出 ready 槽位", () => {
    const onlyUs = legacySplitEnglishText("d2", "the center");
    const edited = writeEnglishText(onlyUs, "uk", richText("the centre"));
    if (edited.mode !== "distinguish") throw new Error("unreachable");
    expect(edited.uk).toMatchObject({
      state: "ready",
      variant: { id: expect.any(String), value: { text: "the centre" } }
    });
  });

  it("收敛保留偏好侧内容，但节点 ID 必须新起", () => {
    const legacy = legacySplitEnglishText("d1", "the color", "the colour");
    const collapsed = collapseEnglishText(legacy, "uk");

    expect(collapsed).toMatchObject({
      mode: "unified",
      common: { value: richText("the colour"), origin: "manual" }
    });
    // 后端把方言编进节点身份：复用 uk 那条的 ID 会被判 node_binding_changed，
    // 「节点 ID 不能更换父节点或内容槽位」，整个 meanings 保存 422。
    expect(collapsed.common.id).not.toBe("d1-uk-text");
    expect(collapsed.common.id).not.toBe("d1-us-text");
    expect(collapseEnglishText(legacy, "us").common.value).toEqual(
      richText("the color")
    );
  });

  it("偏好侧缺失时收敛为空文本并新起节点 ID", () => {
    const onlyUs = legacySplitEnglishText("d2", "the center");
    const collapsed = collapseEnglishText(onlyUs, "uk");
    expect(collapsed.common.value.text).toBe("");
    expect(collapsed.common.id).not.toBe("d2-us-text");
  });

  it("已是单份的文本原样返回", () => {
    const unified = createEnglishText("kept");
    expect(collapseEnglishText(unified, "us")).toBe(unified);
  });

  it("整页收敛：无双份内容时返回同一引用，避免每次渲染都重建", () => {
    const clean: DraftMeaningsStepContent = {
      sense_groups: [{ id: "g1", name_zh: "测试", name_en: "Test" }],
      pos: [createPosMeanings("pos-1", "word-1", "g1")]
    };
    expect(hasDialectSplitEnglishText(clean)).toBe(false);
    expect(collapseMeaningsEnglishText(clean, "uk")).toBe(clean);
  });

  it("整页收敛把所有英文释义与例句折成单份，中文释义不受影响", () => {
    const content = dialectMeaningContent();
    expect(hasDialectSplitEnglishText(content)).toBe(true);

    const collapsed = collapseMeaningsEnglishText(content, "us");
    const englishModes = collapsed.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) => [
        ...sense.definitions
          .filter((definition) => definition.definition_mode.startsWith("en_"))
          .map((definition) => (definition.content as EnglishTextV2).mode),
        ...sense.sentences.map((sentence) => sentence.en_text.mode)
      ])
    );
    expect(englishModes.every((mode) => mode === "unified")).toBe(true);
    expect(hasDialectSplitEnglishText(collapsed)).toBe(false);
    // 中文释义仍是 RichText，不该被当成英文内容处理。
    const zhDefinition = collapsed.pos[0]!.senses[0]!.definitions[0]!;
    expect(zhDefinition.definition_mode).toBe("zh_definition");
  });

  it("统计将被丢弃的非偏好侧内容，空文本不计入", () => {
    const content = dialectMeaningContent();
    // 偏好英式：只有 definition-ready 那条有美式之外的英式内容，丢弃的是美式侧。
    expect(countDiscardedEnglishTexts(content, "uk")).toEqual({
      definitions: 3,
      sentences: 1
    });
    // 偏好美式：只有 definition-ready 填了英式，其余英式侧都是 missing。
    expect(countDiscardedEnglishTexts(content, "us")).toEqual({
      definitions: 1,
      sentences: 0
    });
  });

  it("单份内容不产生任何丢弃", () => {
    const clean: DraftMeaningsStepContent = {
      sense_groups: [{ id: "g1", name_zh: "测试", name_en: "Test" }],
      pos: [createPosMeanings("pos-1", "word-1", "g1")]
    };
    expect(countDiscardedEnglishTexts(clean, "uk")).toEqual({
      definitions: 0,
      sentences: 0
    });
  });

  it("保存 wire 恒为单份，取偏好侧内容", () => {
    const wire = toMeaningsWireContent(dialectMeaningContent(), "uk");
    const definition = wire.pos[0]!.senses[0]!.definitions.find(
      (item) => item.id === "definition-ready"
    )!;
    expect(definition.content).toMatchObject({
      mode: "unified",
      common: { value: richText("the colour"), origin: "manual" }
    });
    expect(
      (definition.content as { common: { id: string } }).common.id
    ).not.toBe("definition-ready-uk-text");
    expect(wire.pos[0]!.senses[0]!.sentences[0]!.en_text.mode).toBe("unified");
  });
});

describe("展示、factory 默认值与边界输入", () => {
  it("word/dialect headword 覆盖 unified、UK、US 与 common source fallback", () => {
    const unifiedForms = createPosForms("adjective", unifiedHeadwords);
    const distinguishedForms = createPosForms("noun", distinguishedHeadwords);
    const unifiedWord = makeWord([unifiedForms], [], unifiedHeadwords);
    const distinguishedWord = makeWord(
      [distinguishedForms],
      [],
      distinguishedHeadwords
    );

    expect(wordDisplayHeadword(unifiedWord)).toBe("far");
    // 不传偏好时退回 source_dialect（管理员当时输入的那一侧）。
    expect(wordDisplayHeadword(distinguishedWord)).toBe("center");
    // 传了偏好就按偏好取，与左栏「当前词条」的排序一致。
    expect(wordDisplayHeadword(distinguishedWord, "uk")).toBe("centre");
    expect(wordDisplayHeadword(distinguishedWord, "us")).toBe("center");
    expect(
      wordDisplayHeadword({
        ...distinguishedWord,
        headwords: { ...distinguishedHeadwords, source_dialect: "uk" }
      })
    ).toBe("centre");
    expect(orderedHeadwordSpellings(unifiedHeadwords)).toEqual(["far"]);
    // 按偏好排，不再按检测基准侧（手测 C5）：缺省偏好是英式。
    expect(orderedHeadwordSpellings(distinguishedHeadwords)).toEqual([
      "centre",
      "center"
    ]);
    expect(orderedHeadwordSpellings(distinguishedHeadwords, "us")).toEqual([
      "center",
      "centre"
    ]);
    // source_dialect 不再影响顺序。
    expect(
      orderedHeadwordSpellings(
        { ...distinguishedHeadwords, source_dialect: "uk" },
        "us"
      )
    ).toEqual(["center", "centre"]);
    expect(dialectHeadword(unifiedHeadwords, "uk")).toBe("far");
    expect(dialectHeadword(distinguishedHeadwords, "uk")).toBe("centre");
    expect(dialectHeadword(distinguishedHeadwords, "us")).toBe("center");
    expect(dialectHeadword(distinguishedHeadwords, "common")).toBe("center");
    expect(
      dialectHeadword(
        { ...distinguishedHeadwords, source_dialect: "uk" },
        "common"
      )
    ).toBe("centre");
  });

  it("叶子 factory 生成独立稳定节点、空默认值与唯一 focus link", () => {
    const pronunciation = createPronunciation();
    const definition = createDefinition();
    const sentence = createSentence("word-1", "sense-1");
    const relation = createRelation("antonym");

    expect(pronunciation).toMatchObject({
      id: expect.any(String),
      dict_phonetic: "",
      actual_pron: "",
      style: "normal"
    });
    expect(definition).toMatchObject({
      id: expect.any(String),
      content_id: expect.any(String),
      level: "A1",
      definition_mode: "zh_definition",
      content: { version: 1, text: "", spans: [], liaisons: [] }
    });
    expect(sentence).toMatchObject({
      id: expect.any(String),
      zh_text_id: expect.any(String),
      level: "A1",
      zh_text: { text: "" },
      links: [{ word_id: "word-1", sense_id: "sense-1", role: "focus" }]
    });
    expect(relation).toEqual({
      id: expect.any(String),
      relation: "antonym",
      target_word_id: "",
      target_sense_id: "",
      score: "0"
    });
    expect(
      new Set([pronunciation.id, definition.id, sentence.id, relation.id]).size
    ).toBe(4);
  });

  it("updateRichText 保留同文标记，改文后清空 offset；CEFR 含非法值安全返回", () => {
    const original = {
      version: 1 as const,
      text: "same",
      spans: [{ start: 0, end: 4, type: "bold" as const }],
      liaisons: [1]
    };

    expect(updateRichText(original, "same")).toBe(original);
    expect(updateRichText(original, "changed")).toEqual({
      version: 1,
      text: "changed",
      spans: [],
      liaisons: []
    });
    expect(
      (["A1", "A2", "B1", "B2", "C1", "C2"] as const).map(cefrRank)
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(cefrRank("invalid" as never)).toBe(-1);
  });
});

describe("真实后端 wire mapper", () => {
  it("tomato 的 plural slot、variant 与稳定节点 ID 完整进入保存 wire", () => {
    const pos = createPosForms("noun", {
      mode: "unified",
      common: "tomato"
    });
    const plural = createDerivedSlot("plural", pos);
    plural.variants[0]!.spelling = "tomatoes";
    plural.variants[0]!.pronunciations[0]!.dict_phonetic = "/təˈmɑːtoʊz/";
    plural.variants[0]!.pronunciations[0]!.actual_pron = "təˈmɑːtoʊz";
    pos.form_groups[0]!.slots.push(plural);

    const wire = toFormsWireContent({ pos: [pos] });

    expect(wire.pos[0]!.base_form).toMatchObject({
      id: pos.base_form.id,
      form_type: "base"
    });
    expect(wire.pos[0]!.form_groups[0]).toMatchObject({
      id: pos.form_groups[0]!.id,
      slots: [
        {
          id: plural.id,
          form_type: "plural",
          variants: [
            {
              id: plural.variants[0]!.id,
              dialect: "common",
              spelling: "tomatoes",
              pronunciations: [
                {
                  id: plural.variants[0]!.pronunciations[0]!.id,
                  dict_phonetic: "/təˈmɑːtoʊz/",
                  actual_pron: "təˈmɑːtoʊz"
                }
              ]
            }
          ]
        }
      ]
    });
  });

  it("词形请求保留节点 ID，并移除旧缓存中的音频只读字段", () => {
    const pos = createPosForms("noun", unifiedHeadwords);
    const pronunciation = pos.base_form.variants[0]!.pronunciations[0]!;
    Object.assign(pronunciation, {
      audio_url: "https://cdn.example.test/audio.mp3",
      audio_source: "tts"
    });

    const wire = toFormsWireContent({ pos: [pos] });
    const wirePronunciation =
      wire.pos[0]!.base_form.variants[0]!.pronunciations[0]!;

    expect(wirePronunciation.id).toBe(pronunciation.id);
    expect(wirePronunciation).not.toHaveProperty("audio_url");
    expect(wirePronunciation).not.toHaveProperty("audio_source");
    expect(pronunciation).toHaveProperty("audio_url");
  });

  it("词义请求保留文本 ID，过滤空 context/relation 并剥离 relation 快照", () => {
    const pos = createPosMeanings("pos-1", "word-1", "sense-group-1");
    const sense = pos.senses[0]!;
    const definition = sense.definitions[0]!;
    const sentence = sense.sentences[0]!;
    sentence.links.push(
      { word_id: "", sense_id: "", role: "context" },
      { word_id: "word-2", sense_id: "sense-2", role: "context" }
    );
    sense.relations = [
      createRelation("antonym"),
      {
        id: "relation-2",
        relation: "synonym",
        target_word_id: "word-2",
        target_sense_id: "sense-2",
        target_headword: "other",
        target_gloss: "另一个",
        score: "75"
      }
    ];
    Object.assign(definition, { audio_url: "legacy-definition.mp3" });
    Object.assign(sentence, { audio_source: "legacy-tts" });

    const wire = toMeaningsWireContent(
      {
        sense_groups: [
          { id: "sense-group-1", name_zh: "测试", name_en: "Test" }
        ],
        pos: [pos]
      },
      "uk"
    );
    const wireSense = wire.pos[0]!.senses[0]!;
    const wireDefinition = wireSense.definitions[0]!;
    const wireSentence = wireSense.sentences[0]!;
    const sourceTextId =
      sentence.en_text.mode === "unified"
        ? sentence.en_text.common.id
        : undefined;

    expect(wireDefinition).toMatchObject({
      id: definition.id,
      content_id: "content_id" in definition ? definition.content_id : ""
    });
    expect(wireSentence).toMatchObject({
      id: sentence.id,
      zh_text_id: sentence.zh_text_id,
      en_text: {
        mode: "unified",
        common: { id: sourceTextId }
      }
    });
    expect(wireSentence.links).toEqual([
      { word_id: "word-1", sense_id: sense.id, role: "focus" },
      { word_id: "word-2", sense_id: "sense-2", role: "context" }
    ]);
    expect(wireSense.relations).toEqual([
      {
        id: "relation-2",
        relation: "synonym",
        target_word_id: "word-2",
        target_sense_id: "sense-2",
        score: "75"
      }
    ]);
    expect(wireDefinition).not.toHaveProperty("audio_url");
    expect(wireSentence).not.toHaveProperty("audio_source");
  });

  /**
   * 复用上面那条用例的构造口径，只把 relations 换成待测形态，
   * 返回上行 wire 里该义项的 relations。
   */
  function wireRelations(relations: WordRelationV2[]) {
    const pos = createPosMeanings("pos-1", "word-1", "sense-group-1");
    pos.senses[0]!.relations = relations;
    const wire = toMeaningsWireContent(
      {
        sense_groups: [
          { id: "sense-group-1", name_zh: "测试", name_en: "Test" }
        ],
        pos: [pos]
      },
      "uk"
    );
    return wire.pos[0]!.senses[0]!.relations;
  }

  it("待物化关联词只上行 trim 后的词面，不夹带 target 两件套", () => {
    const relation = createRelation("synonym");
    relation.pending_target_headword = "  freshword  ";
    relation.pending_target_gloss = "  预定义词义  ";
    relation.score = "60";

    const wired = wireRelations([relation]);

    expect(wired).toHaveLength(1);
    // 词面必须前端 trim：后端 canonicalize 不遍历 relations，首尾空格会直撞
    // `pending = btrim(pending)` 的库层 CHECK，那是 500 不是 422。
    expect(wired[0]!).toEqual({
      id: relation.id,
      relation: "synonym",
      pending_target_headword: "freshword",
      pending_target_gloss: "预定义词义",
      score: "60"
    });
    // toEqual 忽略值为 undefined 的键，两形态互斥只有 not.toHaveProperty 测得住：
    // 带上空串 target 会被库层 shape CHECK 判成非法形状。
    expect(wired[0]!).not.toHaveProperty("target_word_id");
    expect(wired[0]!).not.toHaveProperty("target_sense_id");
  });

  it("同时带 target 两件套与 pending 词面时只上行已绑定形态", () => {
    const relation = createRelation("antonym");
    relation.target_word_id = "word-2";
    relation.target_sense_id = "sense-2";
    // 先键入词面又回头选中真实词条时的残留，绝不能跟着 target 一起发出去。
    relation.pending_target_headword = "freshword";
    relation.pending_target_gloss = "不得随已绑定形态上行";
    relation.score = "80";

    const wired = wireRelations([relation]);

    expect(wired).toHaveLength(1);
    expect(wired[0]!).toEqual({
      id: relation.id,
      relation: "antonym",
      target_word_id: "word-2",
      target_sense_id: "sense-2",
      score: "80"
    });
    expect(wired[0]!).not.toHaveProperty("pending_target_headword");
    expect(wired[0]!).not.toHaveProperty("pending_target_gloss");
  });

  it("目标与词面都不完整的关联词整条丢弃，不发空串占位", () => {
    const blank = createRelation("synonym");
    const halfSelected = createRelation("antonym");
    halfSelected.target_word_id = "word-2";
    const blankPending = createRelation("synonym");
    blankPending.pending_target_headword = "   ";
    const kept = createRelation("derivative");
    kept.target_word_id = "word-3";
    kept.target_sense_id = "sense-3";
    kept.score = "50";

    expect(wireRelations([blank, halfSelected, blankPending, kept])).toEqual([
      {
        id: kept.id,
        relation: "derivative",
        target_word_id: "word-3",
        target_sense_id: "sense-3",
        score: "50"
      }
    ]);
  });

  it("已绑定关联词上行仍是五键，不夹带 pending 字段与只读快照", () => {
    const relation = createRelation("synonym");
    relation.target_word_id = "word-2";
    relation.target_sense_id = "sense-2";
    relation.target_headword = "other";
    relation.target_gloss = "另一个";
    relation.score = "75";

    const wired = wireRelations([relation]);

    expect(wired).toHaveLength(1);
    // 按键名断言：toEqual 放过值为 undefined 的键，键集才能证明没夹带。
    expect(Object.keys(wired[0]!).sort()).toEqual([
      "id",
      "relation",
      "score",
      "target_sense_id",
      "target_word_id"
    ]);
    expect(wired[0]!).not.toHaveProperty("pending_target_headword");
  });
});
