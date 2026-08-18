import type { DraftMeaningsStepContent, EnglishTextV2 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { createPartOfSpeechLookup } from "../part-of-speech/catalog";
import { partOfSpeechCatalogFixture } from "./partOfSpeech.test.helper";
import { buildWordReadiness } from "./readiness";
import { completeMeanings, wordFixture } from "./wordCreation.test.helper";

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

  it("区分方言例句缺任一方言或 focus 关联不唯一时保持未完成", () => {
    const word = wordFixture({ ready: true });
    const meanings = structuredClone(word.meanings);
    const firstSense = meanings.pos[0]!.senses[0]!;
    const firstSentence = firstSense.sentences[0]!;
    if (firstSentence.en_text.mode !== "distinguish") {
      throw new Error("fixture should distinguish dialects");
    }
    firstSentence.en_text.uk = { state: "missing" };
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
      field: "content.uk"
    });
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

  it("基本词性缺少完整基准词形时不因 POS 节点存在而完成", () => {
    const word = wordFixture({ ready: true });
    word.forms.pos[0]!.base_form.variants[0]!.pronunciations[0]!.dict_phonetic =
      "";

    const rows = buildWordReadiness(word);
    const partsOfSpeech = row(rows, "parts_of_speech");

    expect(partsOfSpeech.completed).toBe(1);
    expect(partsOfSpeech.total).toBe(2);
    expect(partsOfSpeech.state).toBe("incomplete");
    expect(partsOfSpeech.target).toMatchObject({
      step: "forms",
      pos_id: word.forms.pos[0]!.pos_id,
      node_id: word.forms.pos[0]!.base_form.variants[0]!.pronunciations[0]!.id,
      field: "dict_phonetic"
    });
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
    grammar.variants.find((variant) => variant.dialect === "us")!.content.text =
      "";
    const sense = meanings.pos[0]!.senses[0]!;
    const content = structuredClone(
      sense.sentences[0]!.en_text
    ) as EnglishTextV2;
    if (content.mode !== "distinguish") {
      throw new Error("fixture should distinguish definition dialects");
    }
    content.us = { state: "missing" };
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
      field: "content.us"
    });
    expect(row(rows, "senses").target).toMatchObject({
      node_id: definition.id,
      field: "content.us"
    });
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
    meanings.pos[0]!.grammar_structures[0]!.variants.pop();
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

  it("必需派生词组为空时显示可定位的待完善项", () => {
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

    expect(forms.state).toBe("incomplete");
    expect(forms.target).toMatchObject({
      step: "forms",
      pos_id: firstPos.pos_id,
      node_id: firstPos.pos_id,
      field: "form_groups"
    });
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

  it("词性目录未加载时不把派生词形判为完成", () => {
    const word = wordFixture({ ready: true });
    const forms = row(
      buildWordReadiness(word, {}, createPartOfSpeechLookup(undefined)),
      "forms"
    );

    expect(forms.state).toBe("incomplete");
    expect(forms.target).toMatchObject({
      pos_id: word.forms.pos[0]!.pos_id,
      node_id: word.forms.pos[0]!.pos_id,
      field: "form_groups"
    });
  });
});
