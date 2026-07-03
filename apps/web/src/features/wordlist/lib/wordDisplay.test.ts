import { describe, expect, it } from "vitest";
import type { AdminWord } from "@tsz/types";
import {
  MOCK_WORD_CENTRE,
  MOCK_WORD_DRESS_UP,
  rt
} from "../data/mockDictWords";
import {
  POS_ABBR,
  POS_CHIP,
  deriveWordView,
  levelTone,
  posChipTone,
  subPosChipTone,
  type PosView
} from "./wordDisplay";

const centre = MOCK_WORD_CENTRE;
const dressUp = MOCK_WORD_DRESS_UP;

describe("rt(富文本速记)", () => {
  it("解析蓝色区间与连读点,标记字符不占位", () => {
    const value = rt("a |bc|~ d");
    expect(value.text).toBe("a bc d");
    expect(value.spans).toEqual([{ start: 2, end: 4, type: "blue" }]);
    // 连读点在 "c"(码点 3)与空格之间
    expect(value.liaisons).toEqual([3]);
  });

  it("无标记时给出干净的纯文本", () => {
    expect(rt("中心.")).toEqual({
      version: 1,
      text: "中心.",
      spans: [],
      liaisons: []
    });
  });
});

describe("deriveWordView", () => {
  it("英式视图:取 uk 词形与语法措辞", () => {
    const view = deriveWordView(centre, "uk");
    expect(view.headword).toBe("centre");
    expect(view.phonetic).toBe("ˈsentə");
    expect(view.kindLabel).toBe("单词");

    const [verb, noun] = view.pos as [PosView, PosView];
    expect(verb.abbr).toBe("v.");
    expect(verb.lineCount).toBe(2);
    expect(verb.forms.map((f) => [f.label, f.spelling])).toEqual([
      ["现在分词", "centring"],
      ["过去式", "centred"],
      ["过去分词", "centred"]
    ]);
    expect(verb.senses[0]!.defLines[0]!.grammar?.text).toBe(
      "something centres; to centre something"
    );

    expect(noun.lineCount).toBe(3);
    expect(noun.forms).toEqual([
      {
        id: "centre-n-pl-uk",
        label: "复数",
        spelling: "centres",
        phonetic: "ˈsentəz"
      }
    ]);
    expect(noun.senses.map((s) => s.subPosLabel)).toEqual([
      "可数名词",
      "可数名词",
      "可数名词"
    ]);
    expect(view.lineCount).toBe(5);
  });

  it("美式视图:整词切换拼写、音标与语法措辞", () => {
    const view = deriveWordView(centre, "us");
    expect(view.headword).toBe("center");
    expect(view.phonetic).toBe("ˈsentɚ");
    expect(view.pos[0]!.forms.map((f) => f.spelling)).toEqual([
      "centering",
      "centered",
      "centered"
    ]);
    expect(view.pos[0]!.senses[0]!.defLines[0]!.grammar?.text).toBe(
      "something centers; to center something"
    );
    expect(view.pos[1]!.forms[0]!.spelling).toBe("centers");
  });

  it("unified 词条在任一方言下回退 common 块", () => {
    const view = deriveWordView(dressUp, "uk");
    expect(view.headword).toBe("dress up");
    expect(view.kindLabel).toBe("词组");
    const grammar = view.pos[0]!.senses[0]!.defLines[0]!.grammar;
    expect(grammar?.text).toBe("someone dresses up; to dress someone up");
    expect(grammar?.liaisons.length).toBeGreaterThan(0);
  });

  it("空词义与空词性被剔除;缺 base/读音/语法关联时安全回退", () => {
    const bare: AdminWord = {
      id: "w-bare",
      kind: "word",
      headword: "bare",
      dialect_mode: "unified",
      dialects: [],
      status: "draft",
      created_by: "a",
      created_at: "",
      updated_at: "",
      sense_groups: [],
      pos: [
        {
          id: "p-empty",
          pos: "noun",
          forms: [],
          grammar_structures: [],
          senses: [
            {
              id: "s-empty",
              sub_pos: "",
              level: "A1",
              depends_on_context: false,
              definitions: [],
              sentences: [],
              relations: []
            }
          ]
        },
        {
          id: "p-adj",
          pos: "adjective",
          forms: [
            {
              id: "f-base",
              dialect: "common",
              form_type: "base",
              spelling: "bare",
              pronunciations: []
            }
          ],
          grammar_structures: [{ id: "gs-empty", variants: [] }],
          senses: [
            {
              id: "s1",
              sub_pos: "",
              level: "A1",
              depends_on_context: false,
              definitions: [
                {
                  id: "d1",
                  level: "A1",
                  def_type: "zh",
                  text: rt("裸露的."),
                  grammar_structure_id: "gs-missing"
                },
                {
                  id: "d2",
                  level: "A2",
                  def_type: "zh",
                  text: rt("光秃的."),
                  grammar_structure_id: "gs-empty"
                },
                { id: "d3", level: "B1", def_type: "zh", text: rt("空的.") }
              ],
              sentences: [],
              relations: []
            }
          ]
        }
      ]
    };

    const view = deriveWordView(bare, "uk");
    // 无释义行的 noun 词性整个剔除
    expect(view.pos.map((p) => p.pos)).toEqual(["adjective"]);
    // base 无读音 → 音标空串;细分词性为空 → 标签空串
    expect(view.headword).toBe("bare");
    expect(view.phonetic).toBe("");
    expect(view.pos[0]!.senses[0]!.subPosLabel).toBe("");
    // 悬空 id / 空 variants / 未关联,语法结构一律为 null
    expect(view.pos[0]!.senses[0]!.defLines.map((l) => l.grammar)).toEqual([
      null,
      null,
      null
    ]);
  });

  it("完全没有 base 词形时回退 headword", () => {
    const noBase: AdminWord = {
      ...dressUp,
      id: "w-nobase",
      pos: [{ ...dressUp.pos[0]!, forms: [] }]
    };
    const view = deriveWordView(noBase, "us");
    expect(view.headword).toBe("dress up");
    expect(view.phonetic).toBe("");
  });
});

describe("标签与色调映射", () => {
  it("每个基本词性都有缩写与徽章", () => {
    for (const pos of Object.keys(POS_ABBR) as (keyof typeof POS_ABBR)[]) {
      expect(POS_ABBR[pos]).toMatch(/\.$/);
      expect(POS_CHIP[pos].en).toBeTruthy();
      expect(POS_CHIP[pos].zh).toBeTruthy();
    }
  });

  it("色调:动词族品红、名词族品牌蓝、其余中性", () => {
    expect(posChipTone("verb")).toBe("verb");
    expect(posChipTone("noun")).toBe("noun");
    expect(posChipTone("adverb")).toBe("neutral");
    expect(subPosChipTone("V-T")).toBe("verb");
    expect(subPosChipTone("MODAL")).toBe("verb");
    expect(subPosChipTone("N-COUNT")).toBe("noun");
    expect(subPosChipTone("PREP")).toBe("neutral");
    expect(subPosChipTone("")).toBe("neutral");
  });

  it("CEFR 等级按段位分色", () => {
    expect(levelTone("A1")).toBe("a");
    expect(levelTone("B2")).toBe("b");
    expect(levelTone("C1")).toBe("c");
  });
});
