import type { EnglishTextV2 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { wordFixture } from "../wordCreation.test.helper";
import {
  countPosMeaningIssues,
  englishTextComplete,
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
