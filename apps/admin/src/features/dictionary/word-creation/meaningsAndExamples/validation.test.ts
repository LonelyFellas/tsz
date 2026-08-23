import type { EnglishTextV2, WordRelationV2 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { wordFixture } from "../wordCreation.test.helper";
import {
  HEADWORD_CHARSET_MESSAGE,
  HEADWORD_NO_LETTER_MESSAGE
} from "../headwordValidation";
import {
  countPosMeaningIssues,
  englishTextComplete,
  englishTextIssueField,
  grammarStructureIssueTarget,
  relationTargetShape,
  sharedSentenceIssueTarget,
  wordSenseComplete,
  wordSenseIssueTarget,
  wordSentenceIssueTarget,
  validateMeanings
} from "./validation";
import { sentenceAssociationMeanings } from "./sentenceAssociationTypes";

describe("meanings and examples validation", () => {
  it("接受完整 unified 与双方言英语文本，拒绝空白或 missing 方言", () => {
    const unified = {
      mode: "unified",
      common: {
        id: "common",
        origin: "manual",
        value: { version: 1, text: "text", spans: [], liaisons: [] }
      }
    } satisfies EnglishTextV2;
    const distinguish = {
      mode: "distinguish",
      source_dialect: "us",
      uk: {
        state: "ready",
        variant: {
          id: "uk",
          origin: "manual",
          value: { version: 1, text: "UK", spans: [], liaisons: [] }
        }
      },
      us: {
        state: "ready",
        variant: {
          id: "us",
          origin: "manual",
          value: { version: 1, text: "US", spans: [], liaisons: [] }
        }
      }
    } satisfies EnglishTextV2;

    expect(englishTextComplete(unified)).toBe(true);
    expect(
      englishTextComplete({
        ...unified,
        common: {
          ...unified.common,
          value: { ...unified.common.value, text: " " }
        }
      })
    ).toBe(false);
    expect(englishTextComplete(distinguish)).toBe(true);
    expect(
      englishTextComplete({ ...distinguish, uk: { state: "missing" } })
    ).toBe(false);
  });

  it("完整 fixture 无校验问题", () => {
    expect(validateMeanings(wordFixture({ ready: true }).meanings)).toEqual([]);
  });

  it("共享例句允许合法 pending，空关联会阻断完整性并定位根节点", () => {
    const meanings = structuredClone(
      sentenceAssociationMeanings(wordFixture({ ready: true }).meanings)
    );
    meanings.shared_sentences = [
      {
        id: "shared-validation",
        level: "A1",
        en_text_id: "shared-validation-en",
        en_text: {
          version: 1,
          text: "Center it.",
          spans: [],
          liaisons: []
        },
        zh_text_id: "shared-validation-zh",
        zh_text: {
          version: 1,
          text: "把它放中间。",
          spans: [],
          liaisons: []
        },
        associations: [
          {
            id: "pending-validation",
            state: "pending",
            source_range: { start: 0, end: 6, surface: "Center" },
            pending_word: "Center"
          }
        ]
      }
    ];
    expect(validateMeanings(meanings)).toEqual([]);
    meanings.shared_sentences[0]!.associations = [];
    expect(sharedSentenceIssueTarget(meanings.shared_sentences[0]!)).toEqual({
      node_id: "shared-validation",
      field: "associations"
    });
    expect(validateMeanings(meanings)).toContain(
      "请补齐多维例句正文、译文和有效位置关联"
    );
  });

  it("存量双份英文内容的 issue 定位指向缺失的那一侧", () => {
    const ready = (id: string, text: string) => ({
      state: "ready" as const,
      variant: {
        id,
        origin: "manual" as const,
        value: { version: 1 as const, text, spans: [], liaisons: [] }
      }
    });
    const split = {
      mode: "distinguish" as const,
      source_dialect: "us" as const,
      uk: ready("legacy-uk", ""),
      us: ready("legacy-us", "American")
    } satisfies EnglishTextV2;

    expect(englishTextIssueField(split)).toBe("content.uk");
    expect(
      englishTextIssueField({ ...split, uk: ready("legacy-uk", "British") })
    ).toBeUndefined();
    expect(englishTextIssueField({ ...split, us: { state: "missing" } })).toBe(
      "content.uk"
    );
  });

  it("英语、语法和例句 issue target 精确到首个无效叶字段", () => {
    const unified = {
      mode: "unified",
      common: {
        id: "common",
        origin: "manual",
        value: { version: 1, text: "", spans: [], liaisons: [] }
      }
    } satisfies EnglishTextV2;
    expect(englishTextIssueField(unified)).toBe("content.common");
    unified.common.value.text = "complete";
    expect(englishTextIssueField(unified)).toBeUndefined();

    const word = wordFixture({ ready: true });
    const grammar = structuredClone(
      word.meanings.pos[0]!.grammar_structures[0]!
    );
    // 新建流程写的单条 common 是合法形状。
    expect(
      grammarStructureIssueTarget(grammar, word.headwords)
    ).toBeUndefined();

    const content = grammar.variants[0]!.content;
    const ukVariant = { id: "grammar-uk", dialect: "uk" as const, content };
    const usVariant = { id: "grammar-us", dialect: "us" as const, content };
    // 存量未收敛的英美双条同样合法（后端 P1 之后放宽）。
    grammar.variants = [ukVariant, usVariant];
    expect(
      grammarStructureIssueTarget(grammar, word.headwords)
    ).toBeUndefined();

    // 语法结构只有一个输入框，定位一律指向 content。缺一侧不合法。
    grammar.variants = [ukVariant];
    expect(grammarStructureIssueTarget(grammar, word.headwords)).toEqual({
      node_id: grammar.id,
      field: "content"
    });
    // 方言重复不合法。
    grammar.variants = [ukVariant, usVariant, { ...usVariant, id: "dup-us" }];
    expect(grammarStructureIssueTarget(grammar, word.headwords)).toEqual({
      node_id: grammar.id,
      field: "content"
    });
    // 统一词条只接受 common，不接受英美双条。
    grammar.variants = [ukVariant, usVariant];
    expect(
      grammarStructureIssueTarget(grammar, { mode: "unified", common: "far" })
    ).toEqual({ node_id: grammar.id, field: "content" });

    const sense = word.meanings.pos[0]!.senses[0]!;
    const sentence = structuredClone(sense.sentences[0]!);
    expect(
      wordSentenceIssueTarget(sentence, sense.id, word.id)
    ).toBeUndefined();

    sentence.level = "invalid" as never;
    expect(wordSentenceIssueTarget(sentence, sense.id, word.id)).toEqual({
      node_id: sentence.id,
      field: "level"
    });
    sentence.level = "A1";
    // A1 之后英文例句恒为单份，缺失定位到 content.common。
    if (sentence.en_text.mode !== "unified") {
      throw new Error("fixture should carry a single English variant");
    }
    const englishText = sentence.en_text.common.value.text;
    sentence.en_text.common.value.text = "";
    expect(wordSentenceIssueTarget(sentence, sense.id, word.id)).toEqual({
      node_id: sentence.id,
      field: "content.common"
    });
    sentence.en_text.common.value.text = englishText;
    sentence.zh_text.text = "";
    expect(wordSentenceIssueTarget(sentence, sense.id, word.id)).toEqual({
      node_id: sentence.id,
      field: "zh_text"
    });
    sentence.zh_text.text = "完整译文";
    sentence.links = [];
    expect(wordSentenceIssueTarget(sentence, sense.id, word.id)).toEqual({
      node_id: sentence.id,
      field: "sentence"
    });
  });

  it("词义 issue target 覆盖无效语法引用与关系词字段", () => {
    const word = wordFixture({ ready: true });
    const pos = word.meanings.pos[0]!;
    const sense = structuredClone(pos.senses[0]!);
    const senseGroupIds = new Set(
      word.meanings.sense_groups.map((group) => group.id)
    );
    const grammarIds = new Set(
      pos.grammar_structures.map((grammar) => grammar.id)
    );

    expect(wordSenseComplete(sense, senseGroupIds, grammarIds)).toBe(true);

    sense.definitions[0]!.grammar_structure_id = "missing-grammar";
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: sense.definitions[0]!.id,
      field: "grammar_structure_id"
    });
    delete sense.definitions[0]!.grammar_structure_id;

    sense.relations = [
      {
        id: "relation",
        relation: "synonym",
        target_word_id: "",
        target_sense_id: "",
        score: "50"
      }
    ];
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: "relation",
      field: "target_word_id"
    });

    sense.relations[0]!.target_word_id = "target-word";
    sense.relations[0]!.target_sense_id = "target-sense";
    sense.relations[0]!.score = "invalid";
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: "relation",
      field: "score"
    });
    expect(wordSenseComplete(sense, senseGroupIds, grammarIds)).toBe(false);
  });

  it("按稳定顺序汇总并去重语义区间、语法、词义、释义、例句与关系问题", () => {
    const content = structuredClone(wordFixture({ ready: true }).meanings);
    content.sense_groups = [
      { id: "group", name_zh: " ", name_en: "😀".repeat(201) }
    ];
    const pos = content.pos[0]!;
    pos.grammar_structures[0]!.variants[0]!.content.text = " ";
    const sense = pos.senses[0]!;
    sense.sense_group_id = "missing";
    sense.sub_pos = "";
    sense.frequency = undefined;
    sense.definitions = [
      {
        id: "english",
        level: "A1",
        definition_mode: "en_definition",
        content: {
          mode: "distinguish",
          source_dialect: "us",
          uk: { state: "missing" },
          us: {
            state: "ready",
            variant: {
              id: "us",
              origin: "manual",
              value: { version: 1, text: "text", spans: [], liaisons: [] }
            }
          }
        }
      }
    ];
    sense.sentences[0]!.zh_text.text = "";
    sense.sentences[0]!.links = [];
    sense.relations = [
      {
        id: "invalid",
        relation: "synonym",
        target_word_id: "",
        target_sense_id: "",
        score: "100.001"
      },
      {
        id: "duplicate-invalid",
        relation: "antonym",
        target_word_id: "",
        target_sense_id: "",
        score: "-1"
      }
    ];

    expect(validateMeanings(content)).toEqual([
      "请填写语义区间 1 的中文名",
      "语义区间 1 的英文名不能超过 200 个字符",
      "请完善全部语法结构文本",
      "请为每个词义选择语义区间",
      "请为每个词义选择细分词性",
      "请填写每个词义的词频（0–100，最多两位小数）",
      "每个词义至少需要一条中文释义",
      "请补齐英文释义的全部启用方言文本",
      "请补齐例句的英文文本和汉语译文",
      "每条例句必须保留唯一的当前词义主关联",
      "请为每个关系词选择具体词条和词义",
      "关系词分值必须是 0–100 且最多两位小数"
    ]);
  });

  it("空数组与 POS 待修计数保持当前分支计数语义", () => {
    expect(validateMeanings({ sense_groups: [], pos: [] })).toEqual([
      "至少需要一个语义区间"
    ]);

    const pos = structuredClone(wordFixture({ ready: true }).meanings.pos[0]!);
    pos.grammar_structures = [];
    pos.senses[0]!.sense_group_id = "unknown";
    pos.senses[0]!.sub_pos = "";
    pos.senses[0]!.frequency = " ";
    pos.senses[0]!.definitions = [];
    pos.senses[0]!.sentences[0]!.zh_text.text = "";

    expect(countPosMeaningIssues(pos, new Set(["group-other"]))).toBe(6);
    expect(
      countPosMeaningIssues({ ...pos, senses: [] }, new Set(["group-other"]))
    ).toBe(2);
  });

  /**
   * 关联词待物化形态（tsz-rust #59）：目标词还没建条时只有词面，发布时后端补建。
   *
   * 形态判定收敛在 `relationTargetShape`，完成校验（`validateMeanings`）与 Tab 红点
   * 定位（`wordSenseIssueTarget`）共用，所以每个场景都两侧各断言一次——只测一处会漏掉
   * 「完成校验说没问题、红点却消不掉」这类不一致。
   */
  const relationScene = (relation: WordRelationV2) => {
    const content = structuredClone(wordFixture({ ready: true }).meanings);
    const pos = content.pos[0]!;
    const sense = pos.senses[0]!;
    sense.relations = [relation];
    return {
      content,
      sense,
      senseGroupIds: new Set(content.sense_groups.map((group) => group.id)),
      grammarIds: new Set(pos.grammar_structures.map((grammar) => grammar.id))
    };
  };

  it("只有词面的待物化关联词在完成校验与红点定位两侧都放行", () => {
    const { content, sense, senseGroupIds, grammarIds } = relationScene({
      id: "relation-pending",
      relation: "synonym",
      pending_target_headword: "freshness",
      score: "50"
    });

    expect(validateMeanings(content)).toEqual([]);
    expect(
      wordSenseIssueTarget(sense, senseGroupIds, grammarIds)
    ).toBeUndefined();
    expect(wordSenseComplete(sense, senseGroupIds, grammarIds)).toBe(true);
  });

  it("待物化词面走主词字符集预检，中文报字符集文案并定位到 pending 字段", () => {
    const { content, sense, senseGroupIds, grammarIds } = relationScene({
      id: "relation-cjk",
      relation: "synonym",
      pending_target_headword: "红色",
      score: "50"
    });

    const issues = validateMeanings(content);
    expect(issues).toContain(`关联词${HEADWORD_CHARSET_MESSAGE}`);
    // 已判成待物化，就不该再退回旧的「没选词条」文案。
    expect(issues).not.toContain("请为每个关系词选择具体词条和词义");
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: "relation-cjk",
      field: "pending_target_headword"
    });
  });

  it("待物化词面没有英文字母时报「至少一个英文字母」", () => {
    const { content, sense, senseGroupIds, grammarIds } = relationScene({
      id: "relation-digits",
      relation: "synonym",
      pending_target_headword: "12345",
      score: "50"
    });

    expect(validateMeanings(content)).toEqual([
      `关联词${HEADWORD_NO_LETTER_MESSAGE}`
    ]);
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: "relation-digits",
      field: "pending_target_headword"
    });
  });

  it("只选了词条没选词义仍按未完成拦截，定位回 target_word_id", () => {
    const { content, sense, senseGroupIds, grammarIds } = relationScene({
      id: "relation-half",
      relation: "antonym",
      target_word_id: "target-word",
      score: "50"
    });

    expect(validateMeanings(content)).toEqual([
      "请为每个关系词选择具体词条和词义"
    ]);
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: "relation-half",
      field: "target_word_id"
    });
  });

  it("形态判定与分值是并列分支，词面非法时两条问题同时报出", () => {
    const { content, sense, senseGroupIds, grammarIds } = relationScene({
      id: "relation-both",
      relation: "synonym",
      pending_target_headword: "红色",
      score: "101"
    });

    expect(validateMeanings(content)).toEqual([
      `关联词${HEADWORD_CHARSET_MESSAGE}`,
      "关系词分值必须是 0–100 且最多两位小数"
    ]);
    // 定位先给词面，改完才轮到分值。
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: "relation-both",
      field: "pending_target_headword"
    });
  });

  it("词面合法但分值非法时照常报分值问题", () => {
    const { content, sense, senseGroupIds, grammarIds } = relationScene({
      id: "relation-score",
      relation: "synonym",
      pending_target_headword: "fresh",
      score: "100.001"
    });

    expect(validateMeanings(content)).toEqual([
      "关系词分值必须是 0–100 且最多两位小数"
    ]);
    expect(wordSenseIssueTarget(sense, senseGroupIds, grammarIds)).toEqual({
      node_id: "relation-score",
      field: "score"
    });
  });

  it("待物化词面按 trim 后判定，首尾空格不算问题", () => {
    const { content, sense, senseGroupIds, grammarIds } = relationScene({
      id: "relation-padded",
      relation: "synonym",
      pending_target_headword: "  fresh  ",
      score: "50"
    });

    expect(validateMeanings(content)).toEqual([]);
    expect(
      wordSenseIssueTarget(sense, senseGroupIds, grammarIds)
    ).toBeUndefined();
  });

  it("relationTargetShape 判定三种形态，两件套齐全时优先算已绑定", () => {
    const base: WordRelationV2 = {
      id: "relation",
      relation: "synonym",
      score: "50"
    };

    expect(
      relationTargetShape({
        ...base,
        target_word_id: " target-word ",
        target_sense_id: " target-sense "
      })
    ).toEqual({
      kind: "bound",
      wordId: "target-word",
      senseId: "target-sense"
    });
    // pending 是选中真实词条前的残留，两件套齐全时一律按已绑定走。
    expect(
      relationTargetShape({
        ...base,
        target_word_id: "target-word",
        target_sense_id: "target-sense",
        pending_target_headword: "fresh"
      })
    ).toEqual({
      kind: "bound",
      wordId: "target-word",
      senseId: "target-sense"
    });

    // 两个 id 键整个缺席（后端 skip_serializing_if 的形状）与前端留的空串等价。
    expect(
      relationTargetShape({ ...base, pending_target_headword: "  fresh  " })
    ).toEqual({ kind: "pending", headword: "fresh" });
    expect(
      relationTargetShape({
        ...base,
        target_word_id: "",
        target_sense_id: "",
        pending_target_headword: "fresh"
      })
    ).toEqual({ kind: "pending", headword: "fresh" });

    expect(relationTargetShape(base)).toEqual({ kind: "incomplete" });
    expect(
      relationTargetShape({ ...base, pending_target_headword: "   " })
    ).toEqual({ kind: "incomplete" });
    expect(
      relationTargetShape({ ...base, target_word_id: "target-word" })
    ).toEqual({ kind: "incomplete" });
    // 半边 id 配词面是库层 CHECK 会拒的混合形状，不能当待物化放行。
    expect(
      relationTargetShape({
        ...base,
        target_sense_id: "target-sense",
        pending_target_headword: "fresh"
      })
    ).toEqual({ kind: "incomplete" });
  });
});
