import type { DraftMeaningsStepContent, EnglishTextV2 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { createPartOfSpeechLookup } from "../part-of-speech/catalog";
import { partOfSpeechCatalogFixture } from "./partOfSpeech.test.helper";
import { buildWordReadiness, pendingReadinessRows } from "./readiness";
import { completeMeanings, wordFixture } from "./wordCreation.test.helper";
import { sentenceAssociationMeanings } from "./meaningsAndExamples/sentenceAssociationTypes";

function row(
  rows: ReturnType<typeof buildWordReadiness>,
  key: ReturnType<typeof buildWordReadiness>[number]["key"]
) {
  return rows.find((candidate) => candidate.key === key)!;
}

describe("buildWordReadiness", () => {
  it("不把系统初始化的空语义区间、语法、词义和例句计为完成", () => {
    const word = wordFixture({
      completed_steps: ["basics", "forms"],
      max_reachable_step: "meanings"
    });
    const rows = buildWordReadiness(word);

    expect(row(rows, "sense_groups")).toMatchObject({
      completed: 0,
      total: 1,
      state: "incomplete"
    });
    expect(row(rows, "grammar_structures")).toMatchObject({
      completed: 0,
      total: 2,
      state: "incomplete"
    });
    expect(row(rows, "senses")).toMatchObject({
      completed: 0,
      total: 2,
      state: "incomplete"
    });
    expect(row(rows, "sentences")).toMatchObject({
      completed: 0,
      total: 2,
      state: "incomplete"
    });
  });

  it("完整内容按类别计为完成", () => {
    const word = wordFixture({ ready: true });
    const rows = buildWordReadiness(word);

    expect(row(rows, "sense_groups")).toMatchObject({
      completed: 1,
      total: 1,
      state: "complete"
    });
    expect(row(rows, "grammar_structures")).toMatchObject({
      completed: 2,
      total: 2,
      state: "complete"
    });
    expect(row(rows, "senses")).toMatchObject({
      completed: 2,
      total: 2,
      state: "complete"
    });
    expect(row(rows, "sentences")).toMatchObject({
      completed: 2,
      total: 2,
      state: "complete"
    });
  });

  it("共享例句纳入多维例句完成度，pending 合法但空关联不完整", () => {
    const word = wordFixture({ ready: true });
    const meanings = structuredClone(
      sentenceAssociationMeanings(word.meanings)
    );
    meanings.shared_sentences = [
      {
        id: "shared-ready",
        level: "A1",
        en_text_id: "shared-ready-en",
        en_text: {
          version: 1,
          text: "Center it.",
          spans: [],
          liaisons: []
        },
        zh_text_id: "shared-ready-zh",
        zh_text: {
          version: 1,
          text: "把它放中间。",
          spans: [],
          liaisons: []
        },
        associations: [
          {
            id: "pending-ready",
            state: "pending",
            source_range: { start: 0, end: 6, surface: "Center" },
            pending_word: "Center"
          }
        ]
      },
      {
        id: "shared-incomplete",
        level: "A1",
        en_text_id: "shared-incomplete-en",
        en_text: {
          version: 1,
          text: "Wall.",
          spans: [],
          liaisons: []
        },
        zh_text_id: "shared-incomplete-zh",
        zh_text: {
          version: 1,
          text: "墙。",
          spans: [],
          liaisons: []
        },
        associations: []
      }
    ];

    expect(
      row(buildWordReadiness(word, { meanings }), "sentences")
    ).toMatchObject({
      completed: 3,
      total: 4,
      state: "incomplete",
      target: {
        node_id: "shared-incomplete",
        field: "associations"
      }
    });
  });

  it("使用当前未保存 meanings 草稿并独立计算部分完成节点", () => {
    const word = wordFixture({
      completed_steps: ["basics", "forms"],
      max_reachable_step: "meanings"
    });
    const complete = completeMeanings(word.meanings, word.headwords);
    const partial: DraftMeaningsStepContent = structuredClone(complete);
    partial.pos[1]!.grammar_structures[0]!.variants[0]!.content.text = "";
    const definition = partial.pos[1]!.senses[0]!.definitions[0]!;
    if (
      definition.definition_mode !== "zh_definition" &&
      definition.definition_mode !== "zh_sentence"
    ) {
      throw new Error("fixture should contain a Chinese definition");
    }
    definition.content.text = "";
    partial.pos[1]!.senses[0]!.sentences[0]!.zh_text.text = "";

    const rows = buildWordReadiness(word, { meanings: partial });

    expect(row(rows, "grammar_structures")).toMatchObject({
      completed: 1,
      total: 2,
      state: "incomplete"
    });
    expect(row(rows, "senses")).toMatchObject({
      completed: 1,
      total: 2,
      state: "incomplete"
    });
    expect(row(rows, "sentences")).toMatchObject({
      completed: 1,
      total: 2,
      state: "incomplete"
    });
  });

  it("英文例句为空或 focus 关联不唯一时保持未完成", () => {
    const word = wordFixture({ ready: true });
    const meanings = structuredClone(word.meanings);
    const firstSense = meanings.pos[0]!.senses[0]!;
    const firstSentence = firstSense.sentences[0]!;
    if (firstSentence.en_text.mode !== "unified") {
      throw new Error("fixture should carry a single English variant");
    }
    firstSentence.en_text.common.value.text = "";
    firstSentence.links.push({
      word_id: word.id,
      sense_id: firstSense.id,
      role: "focus"
    });

    const rows = buildWordReadiness(word, { meanings });
    const sentences = row(rows, "sentences");

    expect(sentences.completed).toBe(1);
    expect(sentences.state).toBe("incomplete");
    expect(sentences.target).toMatchObject({
      step: "meanings",
      pos_id: meanings.pos[0]!.pos_id,
      node_id: firstSentence.id,
      field: "content.common"
    });
  });

  it("存量双份例句按方言偏好判完成：偏好侧有内容就算完成，缺失才未完成", () => {
    const word = wordFixture({ ready: true });
    const meanings = structuredClone(word.meanings);
    const firstSentence = meanings.pos[0]!.senses[0]!.sentences[0]!;
    firstSentence.en_text = {
      mode: "distinguish",
      source_dialect: "us",
      uk: {
        state: "ready",
        variant: {
          id: "legacy-uk",
          value: { version: 1, text: "British only", spans: [], liaisons: [] },
          origin: "manual"
        }
      },
      us: { state: "missing" }
    };

    // 偏好英式：只有英式内容也算完成——保存后正是它成为唯一内容。
    expect(
      row(buildWordReadiness(word, { meanings }, undefined, "uk"), "sentences")
    ).toMatchObject({ state: "complete" });
    // 偏好美式：收敛后会是空的，必须判为未完成。
    expect(
      row(buildWordReadiness(word, { meanings }, undefined, "us"), "sentences")
    ).toMatchObject({ state: "incomplete" });
  });

  it("必需集合为空时显示待完善并提供稳定定位目标", () => {
    const word = wordFixture({
      meanings: { sense_groups: [], pos: [] },
      completed_steps: ["basics", "forms"]
    });
    const rows = buildWordReadiness(word);

    expect(row(rows, "sense_groups")).toMatchObject({
      completed: 0,
      total: 1,
      state: "incomplete",
      target: {
        step: "meanings",
        node_id: word.id,
        field: "sense_groups"
      }
    });
    expect(row(rows, "grammar_structures")).toMatchObject({
      completed: 0,
      total: 2,
      state: "incomplete",
      target: {
        step: "meanings",
        pos_id: word.forms.pos[0]!.pos_id,
        field: "grammar_structures"
      }
    });
  });

  it("基准原形缺音标只计入原形发音，不挂在基本词性名下", () => {
    const word = wordFixture({ ready: true });
    const pronunciation =
      word.forms.pos[0]!.base_form.variants[0]!.pronunciations[0]!;
    pronunciation.dict_phonetic = "";

    const rows = buildWordReadiness(word);

    expect(row(rows, "parts_of_speech")).toMatchObject({
      completed: 2,
      total: 2,
      state: "complete"
    });
    expect(row(rows, "base_pronunciation")).toMatchObject({
      completed: 1,
      total: 2,
      state: "incomplete",
      target: {
        step: "forms",
        pos_id: word.forms.pos[0]!.pos_id,
        node_id: pronunciation.id,
        field: "dict_phonetic"
      }
    });
  });

  it("基准原形拼写与主词不一致时只计入基本词性", () => {
    const word = wordFixture({ ready: true });
    const baseForm = word.forms.pos[0]!.base_form;
    baseForm.variants[0]!.spelling = "mismatch";

    const rows = buildWordReadiness(word);

    expect(row(rows, "parts_of_speech")).toMatchObject({
      completed: 1,
      total: 2,
      state: "incomplete",
      target: {
        step: "forms",
        pos_id: word.forms.pos[0]!.pos_id,
        node_id: baseForm.id,
        field: `variants.${baseForm.variants[0]!.dialect}.spelling`
      }
    });
    expect(row(rows, "base_pronunciation").state).toBe("complete");
  });

  it("拼写为空不会掩盖同一基准原形的读音缺失", () => {
    const word = wordFixture({ ready: true });
    const variant = word.forms.pos[0]!.base_form.variants[0]!;
    variant.spelling = "";
    variant.pronunciations = [];

    const rows = buildWordReadiness(word);

    expect(row(rows, "parts_of_speech")).toMatchObject({
      completed: 1,
      total: 2,
      state: "incomplete"
    });
    expect(row(rows, "base_pronunciation")).toMatchObject({
      completed: 1,
      total: 2,
      state: "incomplete",
      target: { node_id: variant.id, field: "pronunciations" }
    });
  });

  it("尚未选择词性时基本词性待完善，原形发音保持未开始", () => {
    const rows = buildWordReadiness(undefined, { forms: { pos: [] } });

    expect(row(rows, "parts_of_speech")).toMatchObject({
      completed: 0,
      total: 1,
      state: "incomplete",
      target: { step: "forms", node_id: "forms", field: "pos" }
    });
    expect(row(rows, "base_pronunciation")).toMatchObject({
      completed: 0,
      total: 0,
      state: "empty"
    });
    expect(row(rows, "base_pronunciation").target).toBeUndefined();
    expect(pendingReadinessRows(rows, "forms").map((item) => item.key)).toEqual(
      ["parts_of_speech"]
    );
  });

  it("每行标注所属步骤，待完善行按步骤交出，无需填写与未开始都不催办", () => {
    const word = wordFixture({ ready: true });
    for (const pos of word.forms.pos) pos.form_groups = [];
    word.forms.pos[1]!.base_form.variants[0]!.pronunciations[0]!.actual_pron =
      "";
    const rows = buildWordReadiness(
      word,
      {},
      createPartOfSpeechLookup(partOfSpeechCatalogFixture)
    );

    expect(rows.map((item) => [item.key, item.step])).toEqual([
      ["dialect", "basics"],
      ["parts_of_speech", "forms"],
      ["base_pronunciation", "forms"],
      ["forms", "forms"],
      ["sense_groups", "meanings"],
      ["grammar_structures", "meanings"],
      ["senses", "meanings"],
      ["sentences", "meanings"]
    ]);
    expect(row(rows, "forms").state).toBe("not_required");
    expect(pendingReadinessRows(rows, "forms").map((item) => item.key)).toEqual(
      ["base_pronunciation"]
    );
  });

  it("精确定位缺失的派生词形读音字段", () => {
    const word = wordFixture({ ready: true });
    const slot = word.forms.pos[1]!.form_groups[0]!.slots[0]!;
    const pronunciation = slot.variants[0]!.pronunciations[0]!;
    pronunciation.actual_pron = "";

    expect(row(buildWordReadiness(word), "forms").target).toMatchObject({
      node_id: pronunciation.id,
      field: "actual_pron"
    });
  });

  it("精确定位缺失方言的语法和英文释义", () => {
    const word = wordFixture({ ready: true });
    const meanings = structuredClone(word.meanings);
    const grammar = meanings.pos[0]!.grammar_structures[0]!;
    // 语法结构按偏好侧镜像保存，因此清空偏好侧才算未完成；
    // 只清非偏好侧会在保存时被镜像覆盖回来，不该报未完成。
    for (const variant of grammar.variants) variant.content.text = "";
    const sense = meanings.pos[0]!.senses[0]!;
    const content = structuredClone(
      sense.sentences[0]!.en_text
    ) as EnglishTextV2;
    if (content.mode !== "unified") {
      throw new Error("fixture should carry a single English variant");
    }
    content.common.value.text = "";
    const definition = {
      id: "english-definition",
      level: "A1" as const,
      definition_mode: "en_definition" as const,
      content
    };
    sense.definitions.push(definition);

    const rows = buildWordReadiness(word, { meanings });

    expect(row(rows, "grammar_structures").target).toMatchObject({
      node_id: grammar.id,
      field: "content"
    });
    expect(row(rows, "senses").target).toMatchObject({
      node_id: definition.id,
      field: "content.common"
    });
  });

  it("存量双条语法结构只有非偏好侧是空的不算未完成——保存时会随收敛一起消失", () => {
    const word = wordFixture({ ready: true });
    const meanings = structuredClone(word.meanings);
    const grammar = meanings.pos[0]!.grammar_structures[0]!;
    const content = grammar.variants[0]!.content;
    // 存量（A1 改造前）的英美双条，美式那一份从未填过。
    grammar.variants = [
      { id: `${grammar.id}-uk`, dialect: "uk", content },
      {
        id: `${grammar.id}-us`,
        dialect: "us",
        content: { ...content, text: "" }
      }
    ];

    expect(
      row(
        buildWordReadiness(word, { meanings }, undefined, "uk"),
        "grammar_structures"
      ).state
    ).toBe("complete");
  });

  it("语义区间中文名超长时定位中文名", () => {
    const word = wordFixture({ ready: true });
    word.meanings.sense_groups[0]!.name_zh = "中".repeat(201);

    expect(row(buildWordReadiness(word), "sense_groups").target).toMatchObject({
      node_id: word.meanings.sense_groups[0]!.id,
      field: "name_zh"
    });
  });

  it("词形方言集合不精确或存在空读音时保持未完成", () => {
    const word = wordFixture({ ready: true });
    const firstPos = word.forms.pos[0]!;
    firstPos.base_form.variants.pop();
    const derivedSlot = word.forms.pos[1]!.form_groups[0]!.slots[0]!;
    derivedSlot.variants[0]!.pronunciations.push({
      id: "empty-pronunciation",
      dict_phonetic: "",
      actual_pron: "",
      style: "normal"
    });

    const rows = buildWordReadiness(word);

    expect(row(rows, "parts_of_speech").state).toBe("incomplete");
    expect(row(rows, "forms").state).toBe("incomplete");
  });

  it("语法方言集合、词频、细分词性和全部释义共同决定完成状态", () => {
    const word = wordFixture({ ready: true });
    const meanings = structuredClone(word.meanings);
    // 少一条方言变体不再算未完成——保存时镜像会补齐；清空正文才算。
    for (const variant of meanings.pos[0]!.grammar_structures[0]!.variants) {
      variant.content.text = "";
    }
    const secondSense = meanings.pos[1]!.senses[0]!;
    secondSense.frequency = "abc";
    secondSense.sub_pos = "N-COUNT";
    secondSense.definitions.push({
      id: "blank-en-definition",
      level: "A1",
      definition_mode: "en_definition",
      content: {
        mode: "unified",
        common: {
          id: "blank-en-content",
          origin: "manual",
          value: { version: 1, text: "", spans: [], liaisons: [] }
        }
      }
    });

    const rows = buildWordReadiness(
      word,
      { meanings },
      createPartOfSpeechLookup(partOfSpeechCatalogFixture)
    );

    expect(row(rows, "grammar_structures").completed).toBe(1);
    expect(row(rows, "grammar_structures").state).toBe("incomplete");
    expect(row(rows, "senses").completed).toBe(1);
    expect(row(rows, "senses").state).toBe("incomplete");
    expect(row(rows, "senses").target).toMatchObject({
      node_id: secondSense.id,
      field: "sub_pos"
    });
  });

  it("支持派生词的词性也允许当前单词没有派生词", () => {
    const word = wordFixture({ ready: true });
    const firstPos = word.forms.pos[0]!;
    firstPos.form_groups = [];

    const forms = row(
      buildWordReadiness(
        word,
        {},
        createPartOfSpeechLookup(partOfSpeechCatalogFixture)
      ),
      "forms"
    );

    expect(forms.state).toBe("complete");
    expect(forms.target).toBeUndefined();
  });

  it("全部词性都没有派生词时词形变化是无需填写，而不是完成", () => {
    const word = wordFixture({ ready: true });
    for (const pos of word.forms.pos) pos.form_groups = [];

    const forms = row(
      buildWordReadiness(
        word,
        {},
        createPartOfSpeechLookup(partOfSpeechCatalogFixture)
      ),
      "forms"
    );

    expect(forms).toMatchObject({
      completed: 0,
      total: 0,
      state: "not_required"
    });
    expect(forms.target).toBeUndefined();
  });

  it("词性存在但派生能力字段缺失时零派生保持无需填写", () => {
    const word = wordFixture({ ready: true });
    for (const pos of word.forms.pos) pos.form_groups = [];
    const catalogWithoutCapabilities = {
      ...partOfSpeechCatalogFixture,
      items: partOfSpeechCatalogFixture.items.map(
        ({ allowed_form_types: _allowed, ...item }) => item
      )
    };

    const forms = row(
      buildWordReadiness(
        word,
        {},
        createPartOfSpeechLookup(catalogWithoutCapabilities)
      ),
      "forms"
    );

    expect(forms).toMatchObject({
      completed: 0,
      total: 0,
      state: "not_required"
    });
    expect(forms.target).toBeUndefined();
  });

  it("同组派生词形类型重复时定位到该组 slots", () => {
    const word = wordFixture({ ready: true });
    const group = word.forms.pos[1]!.form_groups[0]!;
    group.slots[1]!.form_type = group.slots[0]!.form_type;

    const forms = row(
      buildWordReadiness(
        word,
        {},
        createPartOfSpeechLookup(partOfSpeechCatalogFixture)
      ),
      "forms"
    );

    expect(forms.state).toBe("incomplete");
    expect(forms.target).toMatchObject({
      node_id: group.id,
      field: "slots"
    });
  });

  it("词性目录未加载时按已有派生词形自身完整性判断", () => {
    const word = wordFixture({ ready: true });
    const forms = row(
      buildWordReadiness(word, {}, createPartOfSpeechLookup(undefined)),
      "forms"
    );

    expect(forms.state).toBe("complete");
    expect(forms.target).toBeUndefined();
  });
});
