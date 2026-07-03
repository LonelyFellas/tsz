import type { AdminWord, RichText, WordForm } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  defaultPos,
  defaultSense,
  fromWire,
  frequencyToNumber,
  frequencyToWire,
  newId,
  toRichText,
  toWire
} from "./mapping";

const rich = (text: string, spans: RichText["spans"] = []): RichText => ({
  version: 1,
  text,
  spans,
  liaisons: []
});

/** 后端返回的样例树:distinguish 双方言、base+过去式、双读音、快照/音频等只读字段齐全。 */
function sampleWord(): AdminWord {
  return {
    id: "w-1",
    kind: "word",
    headword: "take",
    frequency: "0.500000",
    dialect_mode: "distinguish",
    dialects: ["uk", "us"],
    status: "draft",
    created_by: "a-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    sense_groups: [{ id: "sg-1", name: "获取类" }],
    pos: [
      {
        id: "p-1",
        pos: "verb",
        forms: [
          {
            id: "f-uk-base",
            dialect: "uk",
            form_type: "base",
            spelling: "take",
            pronunciations: [
              {
                id: "pr-1",
                dict_phonetic: "/teɪk/",
                actual_pron: "/teɪk/",
                style: "normal",
                audio_url: "https://cdn/a.mp3",
                audio_source: "tts"
              },
              {
                id: "pr-2",
                dict_phonetic: "/tək/",
                actual_pron: "/tək/",
                style: "weak"
              }
            ]
          },
          {
            id: "f-uk-past",
            dialect: "uk",
            form_type: "past_tense",
            spelling: "took",
            pronunciations: [
              {
                id: "pr-3",
                dict_phonetic: "/tʊk/",
                actual_pron: "/tʊk/",
                style: "normal"
              }
            ]
          },
          {
            id: "f-us-base",
            dialect: "us",
            form_type: "base",
            spelling: "take",
            pronunciations: [
              {
                id: "pr-4",
                dict_phonetic: "/teɪk/",
                actual_pron: "/teɪk/",
                style: "normal"
              }
            ]
          }
        ],
        grammar_structures: [
          {
            id: "g-1",
            variants: [
              { id: "gv-uk", dialect: "uk", content: rich("take sth") },
              { id: "gv-us", dialect: "us", content: rich("take sth.") }
            ]
          }
        ],
        senses: [
          {
            id: "s-1",
            sub_pos: "V-T",
            level: "A1",
            sense_group_id: "sg-1",
            frequency: "0.300000",
            depends_on_context: true,
            definitions: [
              {
                id: "d-1",
                level: "A1",
                def_type: "zh",
                text: rich("拿,取", [{ start: 0, end: 1, type: "blue" }]),
                grammar_structure_id: "g-1"
              }
            ],
            sentences: [
              {
                id: "x-1",
                text: rich("Take it."),
                audio_url: "https://cdn/x.mp3"
              }
            ],
            relations: [
              {
                id: "r-1",
                relation: "synonym",
                target_word_id: "w-2",
                target_sense_id: "s-9",
                target_headword: "get",
                target_gloss: "得到",
                score: 80
              },
              {
                // 孤儿关联词:目标已删,双 null 只剩快照,必须原样带回。
                id: "r-2",
                relation: "antonym",
                target_headword: "give",
                target_gloss: "给",
                score: 60
              }
            ]
          }
        ]
      }
    ]
  };
}

describe("fromWire → toWire 往返", () => {
  it("所有节点 id 原样保留,不重新生成(D15)", () => {
    const word = sampleWord();
    const out = toWire(fromWire(word), word.updated_at);

    expect(out.base_updated_at).toBe("2026-07-01T10:00:00Z");
    expect(out.sense_groups).toEqual([{ id: "sg-1", name: "获取类" }]);

    const pos = out.pos[0]!;
    expect(pos.id).toBe("p-1");
    expect(pos.forms.map((f) => f.id)).toEqual([
      "f-uk-base",
      "f-uk-past",
      "f-us-base"
    ]);
    expect(
      pos.forms
        .find((f) => f.id === "f-uk-base")!
        .pronunciations.map((p) => p.id)
    ).toEqual(["pr-1", "pr-2"]);
    expect(pos.grammar_structures[0]!.id).toBe("g-1");
    expect(
      pos.grammar_structures[0]!.variants.map((v) => [v.id, v.dialect])
    ).toEqual([
      ["gv-uk", "uk"],
      ["gv-us", "us"]
    ]);
    const sense = pos.senses[0]!;
    expect(sense.id).toBe("s-1");
    expect(sense.definitions[0]!.id).toBe("d-1");
    expect(sense.sentences[0]!.id).toBe("x-1");
    expect(sense.relations.map((r) => r.id)).toEqual(["r-1", "r-2"]);
  });

  it("同一词形的多读音合并回一个 Form;跨词形不串", () => {
    const word = sampleWord();
    const out = toWire(fromWire(word), word.updated_at);
    const ukBase = out.pos[0]!.forms.find((f) => f.id === "f-uk-base")!;
    expect(ukBase.form_type).toBe("base");
    expect(ukBase.spelling).toBe("take");
    expect(ukBase.pronunciations).toHaveLength(2);
    expect(ukBase.pronunciations[1]!.style).toBe("weak");
    const past = out.pos[0]!.forms.find((f) => f.id === "f-uk-past")!;
    expect(past.pronunciations).toHaveLength(1);
  });

  it("标量字段完整往返:方言/词频/词义属性/结构引用", () => {
    const word = sampleWord();
    const out = toWire(fromWire(word), word.updated_at);
    expect(out.dialect_mode).toBe("distinguish");
    expect(out.dialects).toEqual(["uk", "us"]);
    expect(out.frequency).toBe("0.5"); // "0.500000" → 0.5 → "0.5",服务端归一化等价
    const sense = out.pos[0]!.senses[0]!;
    expect(sense.sub_pos).toBe("V-T");
    expect(sense.level).toBe("A1");
    expect(sense.sense_group_id).toBe("sg-1");
    expect(sense.frequency).toBe("0.3");
    expect(sense.depends_on_context).toBe(true);
    expect(sense.definitions[0]!.grammar_structure_id).toBe("g-1");
  });

  it("文本未改 → 富文本 spans 原样保留;audio/快照等服务端字段不上送", () => {
    const word = sampleWord();
    const out = toWire(fromWire(word), word.updated_at);
    const def = out.pos[0]!.senses[0]!.definitions[0]!;
    expect(def.text.spans).toEqual([{ start: 0, end: 1, type: "blue" }]);
    expect(def).not.toHaveProperty("audio_url");
    const pron = out.pos[0]!.forms[0]!.pronunciations[0]!;
    expect(pron).not.toHaveProperty("audio_url");
    const rel = out.pos[0]!.senses[0]!.relations[0]!;
    expect(rel).not.toHaveProperty("target_headword");
  });

  it("孤儿关联词(双 null)保留原 id 与 score 带回", () => {
    const word = sampleWord();
    const out = toWire(fromWire(word), word.updated_at);
    const orphan = out.pos[0]!.senses[0]!.relations[1]!;
    expect(orphan).toMatchObject({
      id: "r-2",
      relation: "antonym",
      score: 60,
      target_word_id: undefined,
      target_sense_id: undefined
    });
  });

  it("unified 模式:dialects 必须为空数组,内容全部挂 common", () => {
    const values = fromWire({
      ...sampleWord(),
      dialect_mode: "unified",
      dialects: [],
      pos: []
    });
    expect(values.dialectMode).toBe("unified");
    const out = toWire(values, "t");
    expect(out.dialects).toEqual([]);
    // 空壳预置的动词 Tab 落到 common 方言。
    expect(out.pos[0]!.forms.every((f) => f.dialect === "common")).toBe(true);
  });
});

describe("toWire 清理规则", () => {
  it("空名语义区间不上送,词义指向被剔除区间时引用一并摘除", () => {
    const word = sampleWord();
    const values = fromWire(word);
    values.senseRanges = [{ id: "sg-1", name: "  " }];
    const out = toWire(values, word.updated_at);
    expect(out.sense_groups).toEqual([]);
    expect(out.pos[0]!.senses[0]!.sense_group_id).toBeUndefined();
  });

  it("全空的词形增行/例句增行/未选目标的关联词行不上送", () => {
    const word = sampleWord();
    const values = fromWire(word);
    const pos = values.posList[0]!;
    pos.inflections.uk!.push({
      formId: "junk-f",
      pronId: "junk-p",
      category: "plural",
      style: "normal"
    });
    pos.senses[0]!.examples.push({ id: "junk-x", text: "  " });
    pos.senses[0]!.synonyms.push({ id: "junk-r" });
    const out = toWire(values, word.updated_at);
    expect(out.pos[0]!.forms.some((f) => f.id === "junk-f")).toBe(false);
    expect(
      out.pos[0]!.senses[0]!.sentences.some((x) => x.id === "junk-x")
    ).toBe(false);
    expect(
      out.pos[0]!.senses[0]!.relations.some((r) => r.id === "junk-r")
    ).toBe(false);
  });

  it("首行(原形)全空时同样不上送:未填过的方言块不产生空拼写节点", () => {
    const word = sampleWord();
    const values = fromWire(word);
    values.posList[0]!.inflections.uk = [
      {
        formId: "blank-f",
        pronId: "blank-p",
        category: "base",
        style: "normal"
      }
    ];
    const out = toWire(values, word.updated_at);
    expect(out.pos[0]!.forms.some((f) => f.id === "blank-f")).toBe(false);
  });

  it("措辞全空的语法结构不上送,释义对它的引用摘除", () => {
    const word = sampleWord();
    const values = fromWire(word);
    values.posList[0]!.grammar[0]!.texts = { uk: "", us: " " };
    const out = toWire(values, word.updated_at);
    expect(out.pos[0]!.grammar_structures).toEqual([]);
    expect(
      out.pos[0]!.senses[0]!.definitions[0]!.grammar_structure_id
    ).toBeUndefined();
  });

  it("释义文本改动后 spans 清空(过期偏移量不带回)", () => {
    const word = sampleWord();
    const values = fromWire(word);
    values.posList[0]!.senses[0]!.definitions[0]!.text = "拿走";
    const out = toWire(values, word.updated_at);
    const def = out.pos[0]!.senses[0]!.definitions[0]!;
    expect(def.text).toEqual({
      version: 1,
      text: "拿走",
      spans: [],
      liaisons: []
    });
  });
});

describe("fromWire 兜底", () => {
  it("空壳词条预置动词 Tab / 占位语义区间行;预置词义带出词条词频", () => {
    const values = fromWire({
      ...sampleWord(),
      pos: [],
      sense_groups: []
    });
    expect(values.posList).toHaveLength(1);
    expect(values.posList[0]!.pos).toBe("verb");
    // 交互约定(§6):预置词义与手动新增词义一样默认带出词条词频。
    expect(values.posList[0]!.senses[0]!.frequency).toBe(0.5);
    expect(values.senseRanges).toHaveLength(1);
    expect(values.senseRanges[0]!.name).toBe("");
  });

  it("无读音的词形也渲染为一行;base 行排在最前", () => {
    const word = sampleWord();
    const noPron: WordForm = {
      id: "f-uk-plural",
      dialect: "uk",
      form_type: "plural",
      spelling: "takes",
      pronunciations: []
    };
    // 故意把 base 放到最后,验证排序。
    word.pos[0]!.forms = [
      noPron,
      ...word.pos[0]!.forms.slice(1),
      word.pos[0]!.forms[0]!
    ];
    const rows = fromWire(word).posList[0]!.inflections.uk!;
    expect(rows[0]!.category).toBe("base");
    expect(rows.some((r) => r.formId === "f-uk-plural" && !r.ipa)).toBe(true);
  });
});

describe("边界与兜底分支", () => {
  it("fromWire:未填词频/空 sub_pos/无文本例句/未知关联类型都能安全落表单", () => {
    const word = sampleWord();
    delete word.frequency;
    const sense = word.pos[0]!.senses[0]!;
    sense.sub_pos = "";
    sense.sentences.push({ id: "x-2" }); // 只有弱引用/占位,无文本快照
    sense.relations.push({
      id: "r-3",
      // @ts-expect-error 后端未来可能扩枚举:未知类型跳过不崩
      relation: "hypernym",
      score: 10
    });
    const values = fromWire(word);
    expect(values.frequency).toBeUndefined();
    const sv = values.posList[0]!.senses[0]!;
    expect(sv.subPos).toBeUndefined();
    expect(sv.examples.find((x) => x.id === "x-2")!.text).toBe("");
    expect([...sv.synonyms, ...sv.antonyms, ...sv.derivatives]).toHaveLength(2);
  });

  it("同类别不同拼写不合并(两个过去式合法);未选类别的增行按原形处理", () => {
    const word = sampleWord();
    const values = fromWire(word);
    const rows = values.posList[0]!.inflections.uk!;
    rows.push(
      {
        formId: "f-a",
        pronId: "p-a",
        category: "past_tense",
        spelling: "taked",
        style: "normal"
      },
      // 用户增行后没选类别就填了拼写 → 按 base 处理(与首行同拼写则并入首行读音)
      {
        formId: "f-b",
        pronId: "p-b",
        category: undefined as never,
        spelling: "hmm",
        style: "normal"
      }
    );
    const out = toWire(values, word.updated_at);
    const forms = out.pos[0]!.forms.filter((f) => f.dialect === "uk");
    // took 与 taked:同 past_tense 不同拼写,两个独立词形。
    expect(forms.filter((f) => f.form_type === "past_tense")).toHaveLength(2);
    expect(forms.find((f) => f.id === "f-b")!.form_type).toBe("base");
  });

  it("已有语法结构补新方言措辞:沿用结构 id,新措辞现场发 id", () => {
    const word = sampleWord();
    const values = fromWire(word);
    const row = values.posList[0]!.grammar[0]!;
    delete row.variantIds.us; // 模拟 us 措辞是本次新增
    const out = toWire(values, word.updated_at);
    const variants = out.pos[0]!.grammar_structures[0]!.variants;
    expect(variants.find((v) => v.dialect === "uk")!.id).toBe("gv-uk");
    const usId = variants.find((v) => v.dialect === "us")!.id;
    expect(usId).not.toBe("gv-us");
    expect(usId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("toWire:getFieldsValue 可能给出的缺省字段(列表/开关未注册)不崩", () => {
    const sparse = {
      frequency: undefined,
      dialectMode: "unified",
      dialects: [],
      senseRanges: undefined,
      posList: [
        {
          id: "p-x",
          pos: "noun",
          inflections: {},
          grammar: undefined,
          senses: [
            {
              id: "s-x",
              level: "A1",
              subPos: undefined,
              contextDependent: undefined,
              definitions: undefined,
              examples: undefined,
              synonyms: [],
              antonyms: [],
              derivatives: []
            }
          ]
        }
      ]
    } as unknown as Parameters<typeof toWire>[0];
    const out = toWire(sparse, "t");
    expect(out.frequency).toBe("");
    expect(out.sense_groups).toEqual([]);
    expect(out.pos[0]!).toMatchObject({
      id: "p-x",
      forms: [],
      grammar_structures: []
    });
    expect(out.pos[0]!.senses[0]!).toMatchObject({
      sub_pos: "",
      depends_on_context: false,
      definitions: [],
      sentences: [],
      relations: []
    });
  });
});

describe("工具函数", () => {
  it("toRichText:文本一致保留原对象,不一致清空标记", () => {
    const original = rich("abc", [{ start: 0, end: 1, type: "bold" }]);
    expect(toRichText("abc", original)).toBe(original);
    expect(toRichText("abcd", original).spans).toEqual([]);
    expect(toRichText("x")).toEqual({
      version: 1,
      text: "x",
      spans: [],
      liaisons: []
    });
  });

  it("词频转换:空串/undefined ↔ 未填,非法字符串归 undefined", () => {
    expect(frequencyToNumber("0.500000")).toBe(0.5);
    expect(frequencyToNumber("")).toBeUndefined();
    expect(frequencyToNumber(undefined)).toBeUndefined();
    expect(frequencyToNumber("abc")).toBeUndefined();
    expect(frequencyToWire(0.5)).toBe("0.5");
    expect(frequencyToWire(undefined)).toBe("");
    expect(frequencyToWire(null)).toBe("");
  });

  it("默认值工厂:新节点现场发 UUID,词义默认带出词条词频", () => {
    const pos = defaultPos("noun", 1.5);
    expect(pos.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(pos.inflections.uk![0]!.category).toBe("base");
    // 新增词性 Tab 的首个词义与手动新增词义同规则:带出词条词频。
    expect(pos.senses[0]!.frequency).toBe(1.5);
    const sense = defaultSense(1.5);
    expect(sense.frequency).toBe(1.5);
    expect(sense.definitions).toHaveLength(1);
  });

  it("newId:无 randomUUID(HTTP 非安全上下文)降级手拼,仍是合法 UUID v4", () => {
    // tshb-test 裸 IP HTTP 下浏览器不暴露 crypto.randomUUID,整页崩的回归。
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: real.getRandomValues.bind(real)
    });
    try {
      const a = newId();
      const b = newId();
      const v4 =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(a).toMatch(v4);
      expect(b).toMatch(v4);
      expect(a).not.toBe(b);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
