import type { EnglishTextV2 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { wordFixture } from "../wordCreation.test.helper";
import {
  countPosMeaningIssues,
  englishTextComplete,
  englishTextIssueField,
  grammarStructureIssueTarget,
  wordSenseComplete,
  wordSenseIssueTarget,
  wordSentenceIssueTarget,
  validateMeanings
} from "./validation";

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
    const usGrammar = grammar.variants.find(
      (variant) => variant.dialect === "us"
    )!;
    grammar.variants = grammar.variants.filter(
      (variant) => variant.dialect !== "us"
    );
    // 语法结构只有一个输入框，定位一律指向 content。
    expect(grammarStructureIssueTarget(grammar, word.headwords)).toEqual({
      node_id: grammar.id,
      field: "content"
    });
    grammar.variants.push(usGrammar);
    grammar.variants.push({ ...usGrammar, id: "duplicate-us" });
    expect(grammarStructureIssueTarget(grammar, word.headwords)).toEqual({
      node_id: grammar.id,
      field: "content"
    });

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
});
