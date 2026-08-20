import { describe, expect, it } from "vitest";
import { createPartOfSpeechLookup } from "../../part-of-speech/catalog";
import { partOfSpeechCatalogFixture } from "../partOfSpeech.test.helper";
import { wordFixture } from "../wordCreation.test.helper";
import {
  applySoleSubPartOfSpeech,
  collectPronunciationHints,
  countSenseReferences,
  meaningsPosOwnsNode,
  removeSenseAndReferences,
  senseOwnsNode
} from "./mapping";

describe("meanings and examples mapping", () => {
  it("按规范化 spelling 生成首次有效发音提示，空值与重复项不覆盖", () => {
    const word = wordFixture();
    const base = word.forms.pos[0]!.base_form;
    const sample = base.variants[0]!;
    base.variants = [
      {
        ...sample,
        spelling: " Center ",
        pronunciations: [
          {
            ...sample.pronunciations[0]!,
            dict_phonetic: "",
            actual_pron: " s1 "
          }
        ]
      },
      {
        ...sample,
        id: "duplicate",
        spelling: "center",
        pronunciations: [
          { ...sample.pronunciations[0]!, id: "p2", dict_phonetic: "s2" }
        ]
      },
      { ...sample, id: "empty", spelling: "", pronunciations: [] }
    ];

    expect(collectPronunciationHints({ pos: [word.forms.pos[0]!] })).toEqual({
      center: "s1",
      centers: "ˈsentərz",
      centres: "ˈsentəz"
    });
  });

  it("识别 POS、语法、variant、词义及其子节点归属", () => {
    const pos = wordFixture().meanings.pos[0]!;
    const sense = pos.senses[0]!;
    const ownedIds = [
      pos.pos_id,
      pos.grammar_structures[0]!.id,
      pos.grammar_structures[0]!.variants[0]!.id,
      sense.id,
      sense.definitions[0]!.id,
      sense.sentences[0]!.id
    ];

    expect(ownedIds.every((id) => meaningsPosOwnsNode(pos, id))).toBe(true);
    expect(senseOwnsNode(sense, "outside")).toBe(false);
    expect(meaningsPosOwnsNode(pos, "outside")).toBe(false);
  });

  it("计数并删除目标词义及跨节点引用，同时保持顺序、非目标引用和原输入", () => {
    const content = structuredClone(wordFixture().meanings);
    const pos = content.pos[0]!;
    const target = pos.senses[0]!;
    const survivor = structuredClone(target);
    survivor.id = "survivor";
    survivor.sentences[0]!.id = "survivor-sentence";
    survivor.sentences[0]!.links = [
      {
        role: "context",
        word_id: "word-center",
        sense_id: target.id
      },
      {
        role: "context",
        word_id: "word-other",
        sense_id: target.id
      }
    ];
    survivor.relations = [
      {
        id: "target-relation",
        relation: "synonym",
        target_word_id: "word-center",
        target_sense_id: target.id,
        score: "50"
      },
      {
        id: "other-relation",
        relation: "antonym",
        target_word_id: "word-other",
        target_sense_id: target.id,
        score: "20"
      }
    ];
    pos.senses.push(survivor);

    expect(countSenseReferences(content, "word-center", target.id)).toBe(2);
    const cleaned = removeSenseAndReferences(content, "word-center", target.id);

    expect(cleaned.pos[0]!.senses.map((sense) => sense.id)).toEqual([
      "survivor"
    ]);
    expect(cleaned.pos[0]!.senses[0]!.sentences[0]!.links).toEqual([
      expect.objectContaining({ word_id: "word-other" })
    ]);
    expect(cleaned.pos[0]!.senses[0]!.relations).toEqual([
      expect.objectContaining({ id: "other-relation" })
    ]);
    expect(content.pos[0]!.senses).toHaveLength(2);
  });

  it("基本词性只有一个细分项时回填空值，已有取值与多选项场景保持原样", () => {
    const lookup = createPartOfSpeechLookup(partOfSpeechCatalogFixture);
    // far = 形容词 + 副词，两者在目录里都只配置了一个细分项。
    const word = wordFixture({ headword: "far" });
    word.meanings.pos[1]!.senses[0]!.sub_pos = "V-T";

    const filled = applySoleSubPartOfSpeech(word.meanings, word.forms, lookup);

    expect(filled.pos[0]!.senses[0]!.sub_pos).toBe("ADJ");
    // 与当前基本词性不符的存量编码不被改写，留给校验拒绝保存。
    expect(filled.pos[1]!.senses[0]!.sub_pos).toBe("V-T");
    expect(word.meanings.pos[0]!.senses[0]!.sub_pos).toBe("");
    // 已无可回填项时返回同一引用，effect 才能收敛。
    expect(applySoleSubPartOfSpeech(filled, word.forms, lookup)).toBe(filled);
  });

  it("细分项多于一个、词性未知或目录不可用时都不回填", () => {
    const lookup = createPartOfSpeechLookup(partOfSpeechCatalogFixture);
    // center = 名词 + 动词，两者各有多个细分项。
    const multi = wordFixture();
    expect(applySoleSubPartOfSpeech(multi.meanings, multi.forms, lookup)).toBe(
      multi.meanings
    );

    const sole = wordFixture({ headword: "far" });
    expect(applySoleSubPartOfSpeech(sole.meanings, { pos: [] }, lookup)).toBe(
      sole.meanings
    );
    expect(
      applySoleSubPartOfSpeech(
        sole.meanings,
        sole.forms,
        createPartOfSpeechLookup(undefined)
      )
    ).toBe(sole.meanings);
  });
});
