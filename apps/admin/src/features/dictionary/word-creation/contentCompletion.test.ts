import type { ContentCompletionJob } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { completeMeanings, wordFixture } from "./wordCreation.test.helper";
import {
  applyContentCompletion,
  shouldPollContentCompletion
} from "./contentCompletion";
import { createEnglishText } from "./model";

function job(
  word = wordFixture(),
  result = completeMeanings(
    structuredClone(word.meanings),
    word.headwords,
    word.forms
  )
): ContentCompletionJob {
  return {
    id: "job-1",
    entry_id: word.id,
    base_revision: word.revision,
    status: "completed",
    requested_scope: ["grammar_structures", "meanings", "examples"],
    fill_policy: "missing_only",
    partitions: word.forms.pos.map((pos) => ({
      pos_id: pos.pos_id,
      pos: pos.pos,
      status: "completed",
      attempt: 1
    })),
    result,
    created_at: "2026-08-18T00:00:00Z",
    updated_at: "2026-08-18T00:00:01Z"
  };
}

describe("content completion", () => {
  it("只轮询等待中和运行中的任务", () => {
    expect(shouldPollContentCompletion("pending")).toBe(true);
    expect(shouldPollContentCompletion("running")).toBe(true);
    expect(shouldPollContentCompletion("completed")).toBe(false);
    expect(shouldPollContentCompletion("partial")).toBe(false);
    expect(shouldPollContentCompletion("failed")).toBe(false);
  });

  it("用生成结果替换初始化空占位并保持引用闭包", () => {
    const word = wordFixture();
    const result = applyContentCompletion(
      word,
      word.meanings,
      job(word),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.every((item) => item.outcome === "applied")).toBe(
      true
    );
    expect(result.content.pos[0]!.senses[0]!.sentences).not.toHaveLength(0);
    const sense = result.content.pos[0]!.senses[0]!;
    expect(sense.sentences[0]!.links).toContainEqual({
      word_id: word.id,
      sense_id: sense.id,
      role: "focus"
    });
  });

  it("跳过已有人工内容而不覆盖", () => {
    const word = wordFixture({ ready: true });
    const original = structuredClone(word.meanings);
    const candidate = completeMeanings(
      structuredClone(wordFixture().meanings),
      word.headwords,
      word.forms
    );
    const result = applyContentCompletion(
      word,
      original,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.report.every((item) => item.outcome === "skipped_existing")
    ).toBe(true);
    expect(result.content).toEqual(original);
  });

  it("保留人工释义并补齐同词义缺失的例句", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    const sense = current.pos[0]!.senses[0]!;
    const manualDefinition = sense.definitions[0]!;
    if (!("content_id" in manualDefinition)) throw new Error("expected zh");
    manualDefinition.content.text = "人工填写的释义";
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    const result = applyContentCompletion(
      word,
      current,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = result.content.pos[0]!.senses[0]!;
    expect(merged.definitions[0]).toEqual(manualDefinition);
    expect(merged.sentences.some((sentence) => sentence.zh_text.text)).toBe(
      true
    );
    expect(
      merged.sentences.every(
        (sentence) =>
          sentence.zh_text.text.trim() ||
          (sentence.en_text.mode === "unified"
            ? sentence.en_text.common.value.text.trim()
            : [sentence.en_text.uk, sentence.en_text.us].some(
                (slot) =>
                  slot.state === "ready" && slot.variant.value.text.trim()
              ))
      )
    ).toBe(true);
    expect(
      merged.sentences[0]!.links.some(
        (link) => link.role === "focus" && link.sense_id === sense.id
      )
    ).toBe(true);
  });

  it("保留人工中文释义并追加缺失的英文释义", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    const manualDefinition = current.pos[0]!.senses[0]!.definitions[0]!;
    if (!("content_id" in manualDefinition)) throw new Error("expected zh");
    manualDefinition.content.text = "人工中文释义";
    current.pos[0]!.senses[0]!.definitions.push({
      definition_mode: "en_definition",
      id: "empty-en-placeholder",
      level: "A1",
      content: createEnglishText()
    });
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    candidate.pos[0]!.senses[0]!.definitions.push({
      definition_mode: "en_definition",
      id: "generated-en-definition",
      level: "B1",
      content: createEnglishText()
    });
    const english = candidate.pos[0]!.senses[0]!.definitions[1]!;
    if ("content_id" in english) throw new Error("expected en");
    if (english.content.mode === "unified") {
      english.content.common.value.text = "a generated English definition";
    } else {
      const ready = [english.content.uk, english.content.us].find(
        (slot) => slot.state === "ready"
      );
      if (ready?.state === "ready") {
        ready.variant.value.text = "a generated English definition";
      }
    }
    const result = applyContentCompletion(
      word,
      current,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.pos[0]!.senses[0]!.definitions).toEqual(
      expect.arrayContaining([manualDefinition, english])
    );
    expect(
      result.content.pos[0]!.senses[0]!.definitions.some(
        (definition) => definition.id === "empty-en-placeholder"
      )
    ).toBe(false);
  });

  it("追加生成语法时移除空语法占位并保留人工语法", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    const manualGrammar = current.pos[0]!.grammar_structures[0]!;
    manualGrammar.variants[0]!.content.text = "manual grammar";
    const emptyGrammar = structuredClone(manualGrammar);
    emptyGrammar.id = "empty-grammar-placeholder";
    emptyGrammar.variants[0]!.id = "empty-grammar-variant";
    emptyGrammar.variants[0]!.content.text = "";
    current.pos[0]!.grammar_structures.push(emptyGrammar);
    const result = applyContentCompletion(word, current, job(word), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const grammar = result.content.pos[0]!.grammar_structures;
    expect(grammar).toContainEqual(manualGrammar);
    expect(
      grammar.some((item) => item.id === "empty-grammar-placeholder")
    ).toBe(false);
  });

  it("删除空占位是唯一变化时也会写回清理结果", () => {
    const word = wordFixture();
    const current = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    const candidate = structuredClone(current);
    const sense = current.pos[0]!.senses[0]!;
    const emptyDefinition = structuredClone(sense.definitions[0]!);
    if ("content_id" in emptyDefinition) emptyDefinition.content.text = "";
    emptyDefinition.id = "filter-only-empty-definition";
    sense.definitions.push(emptyDefinition);
    const emptySentence = structuredClone(sense.sentences[0]!);
    emptySentence.id = "filter-only-empty-sentence";
    emptySentence.zh_text.text = "";
    if (emptySentence.en_text.mode === "unified") {
      emptySentence.en_text.common.value.text = "";
    } else {
      for (const slot of [emptySentence.en_text.uk, emptySentence.en_text.us]) {
        if (slot.state === "ready") slot.variant.value.text = "";
      }
    }
    sense.sentences.push(emptySentence);
    const result = applyContentCompletion(
      word,
      current,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = result.content.pos[0]!.senses[0]!;
    expect(
      merged.definitions.some(
        (item) => item.id === "filter-only-empty-definition"
      )
    ).toBe(false);
    expect(
      merged.sentences.some((item) => item.id === "filter-only-empty-sentence")
    ).toBe(false);
  });

  it("多词义无可靠锚点时仍清理人工词义内的空占位", () => {
    const word = wordFixture();
    const current = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    const second = structuredClone(current.pos[0]!.senses[0]!);
    second.id = "manual-second-sense";
    second.sub_pos = "manual";
    second.definitions = second.definitions.map((definition) => {
      const empty = structuredClone(definition);
      empty.id = `empty-${definition.id}`;
      if ("content_id" in empty) empty.content.text = "";
      return empty;
    });
    second.sentences = [];
    current.pos[0]!.senses.push(second);
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    const result = applyContentCompletion(
      word,
      current,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preserved = result.content.pos[0]!.senses.find(
      (sense) => sense.id === second.id
    );
    expect(preserved?.sub_pos).toBe("manual");
    expect(preserved?.definitions).toEqual([]);
  });

  it("保留人工例句并追加不重复的生成例句", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    const manualSentence = current.pos[0]!.senses[0]!.sentences[0]!;
    manualSentence.zh_text.text = "人工例句。";
    if (manualSentence.en_text.mode === "unified") {
      manualSentence.en_text.common.value.text = "A manual example.";
    }
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    const generatedSentence = candidate.pos[0]!.senses[0]!.sentences[0]!;
    const result = applyContentCompletion(
      word,
      current,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.pos[0]!.senses[0]!.sentences).toEqual(
      expect.arrayContaining([
        manualSentence,
        expect.objectContaining({ id: generatedSentence.id })
      ])
    );
  });

  it("回填时保留尚未关联词义的人工语义区间", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    const unlinked = {
      id: "manual-unlinked-group",
      name_zh: "人工待关联区间",
      name_en: "manual unlinked group"
    };
    current.sense_groups.push(unlinked);
    const result = applyContentCompletion(word, current, job(word), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.sense_groups).toContainEqual(unlinked);
  });

  it("revision 或生成后的本地编辑变化会阻止应用", () => {
    const word = wordFixture();
    const stale = job(word);
    expect(
      applyContentCompletion(
        { ...word, revision: word.revision + 1 },
        word.meanings,
        stale,
        false
      )
    ).toEqual({ ok: false, reason: "revision_changed" });
    expect(applyContentCompletion(word, word.meanings, stale, true)).toEqual({
      ok: false,
      reason: "local_changes_after_generation"
    });
  });

  it("拒绝错误 focus link 和悬空 grammar 引用", () => {
    const word = wordFixture();
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    candidate.pos[0]!.senses[0]!.sentences[0]!.links[0]!.sense_id = "wrong";
    candidate.pos[1]!.senses[0]!.definitions[0]!.grammar_structure_id =
      "missing";
    const result = applyContentCompletion(
      word,
      word.meanings,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pos_id: candidate.pos[0]!.pos_id,
          outcome: "failed"
        }),
        expect.objectContaining({
          pos_id: candidate.pos[1]!.pos_id,
          outcome: "failed"
        })
      ])
    );
  });

  it("没有候选结果时保持当前内容不变", () => {
    const word = wordFixture();
    const withoutResult = job(word);
    withoutResult.result = undefined;
    expect(
      applyContentCompletion(word, word.meanings, withoutResult, false)
    ).toEqual({
      ok: true,
      content: word.meanings,
      report: []
    });
  });

  it("输出只包含候选存在的词性并允许当前空占位没有 sense group", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    current.pos = current.pos.slice(0, 1);
    current.pos[0]!.senses[0]!.sense_group_id = undefined;
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    candidate.pos = candidate.pos.slice(0, 1);
    const result = applyContentCompletion(
      word,
      current,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.pos).toHaveLength(1);
  });

  it("保留没有 sense group 的现有人工词性", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    current.pos[1]!.senses[0]!.sense_group_id = undefined;
    current.pos[1]!.senses[0]!.sub_pos = "manual";
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    candidate.pos = candidate.pos.slice(0, 1);
    const result = applyContentCompletion(
      word,
      current,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.pos[1]!.senses[0]!.sub_pos).toBe("manual");
  });

  it("英文定义占位参与人工内容判断", () => {
    const word = wordFixture();
    const current = structuredClone(word.meanings);
    const completed = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    const englishDefinition = {
      definition_mode: "en_definition" as const,
      id: "empty-english-definition",
      level: "A1" as const,
      content: createEnglishText()
    };
    current.pos[0]!.senses[0]!.definitions = [englishDefinition];
    const result = applyContentCompletion(
      word,
      current,
      job(word, completed),
      false
    );
    expect(result.ok).toBe(true);
  });

  it("拒绝候选分区内重复 UUID", () => {
    const word = wordFixture();
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    candidate.pos[0]!.grammar_structures[0]!.variants[0]!.id =
      candidate.pos[0]!.grammar_structures[0]!.id;
    const result = applyContentCompletion(
      word,
      word.meanings,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report[0]!.outcome).toBe("failed");
  });

  it("拒绝重复定义 content_id 和空例句文本", () => {
    const word = wordFixture();
    const candidate = completeMeanings(
      structuredClone(word.meanings),
      word.headwords,
      word.forms
    );
    const firstDefinition = candidate.pos[0]!.senses[0]!.definitions[0]!;
    if ("content_id" in firstDefinition) {
      firstDefinition.content_id = firstDefinition.id;
    }
    candidate.pos[1]!.senses[0]!.sentences[0]!.zh_text.text = "";
    const result = applyContentCompletion(
      word,
      word.meanings,
      job(word, candidate),
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report).toEqual([
      expect.objectContaining({ outcome: "failed" }),
      expect.objectContaining({ outcome: "failed" })
    ]);
  });
});
