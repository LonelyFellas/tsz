import type {
  CefrLevel,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  EnglishTextV2,
  GrammarStructureV2,
  RichText,
  WordDefinitionV2,
  WordHeadwordsV2,
  WordPosMeaningsV2,
  WordPosTag,
  WordSenseV2,
  WordSentenceV2
} from "@tsz/types";
import type { PartOfSpeechLookup } from "../../part-of-speech/catalog";

const CEFR_LEVELS = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);

export interface MeaningsValidationContext {
  word_id?: string;
  headwords?: WordHeadwordsV2;
  forms?: DraftFormsStepContent;
  partOfSpeechLookup?: PartOfSpeechLookup;
}

export interface MeaningIssueTarget {
  node_id: string;
  field: string;
}

export function englishTextComplete(value: EnglishTextV2): boolean {
  if (value.mode === "unified") return value.common.value.text.trim() !== "";
  return (["uk", "us"] as const).every((dialect) => {
    const slot = value[dialect];
    return slot.state === "ready" && slot.variant.value.text.trim() !== "";
  });
}

export function englishTextIssueField(
  value: EnglishTextV2
): string | undefined {
  if (value.mode === "unified") {
    return value.common.value.text.trim() ? undefined : "content.common";
  }
  for (const dialect of ["uk", "us"] as const) {
    const slot = value[dialect];
    if (slot.state !== "ready" || !slot.variant.value.text.trim()) {
      return `content.${dialect}`;
    }
  }
  return undefined;
}

export function cefrLevelComplete(level: CefrLevel): boolean {
  return CEFR_LEVELS.has(level);
}

export function fixedPercentComplete(value?: string): boolean {
  return Boolean(
    value && /^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(value)
  );
}

export function grammarStructureComplete(
  grammar: GrammarStructureV2,
  headwords?: WordHeadwordsV2
): boolean {
  const expected = headwords
    ? headwords.mode === "distinguish"
      ? (["uk", "us"] as const)
      : (["common"] as const)
    : undefined;
  const dialects = new Set(grammar.variants.map((variant) => variant.dialect));
  return Boolean(
    grammar.variants.length > 0 &&
    (!expected ||
      (grammar.variants.length === expected.length &&
        dialects.size === expected.length &&
        expected.every((dialect) => dialects.has(dialect)))) &&
    grammar.variants.every((variant) => variant.content.text.trim() !== "")
  );
}

export function grammarStructureIssueTarget(
  grammar: GrammarStructureV2,
  headwords?: WordHeadwordsV2
): MeaningIssueTarget | undefined {
  const expected = headwords
    ? headwords.mode === "distinguish"
      ? (["uk", "us"] as const)
      : (["common"] as const)
    : grammar.variants.map((variant) => variant.dialect);
  for (const dialect of expected) {
    const variant = grammar.variants.find((item) => item.dialect === dialect);
    if (!variant || !variant.content.text.trim()) {
      return { node_id: grammar.id, field: `content.${dialect}` };
    }
  }
  const dialects = new Set(grammar.variants.map((variant) => variant.dialect));
  if (
    grammar.variants.length === 0 ||
    grammar.variants.length !== expected.length ||
    dialects.size !== expected.length
  ) {
    return { node_id: grammar.id, field: "content" };
  }
  return undefined;
}

export function definitionComplete(
  definition: WordDefinitionV2,
  grammarIds: ReadonlySet<string>
): boolean {
  if (
    !cefrLevelComplete(definition.level) ||
    (definition.grammar_structure_id !== undefined &&
      !grammarIds.has(definition.grammar_structure_id))
  ) {
    return false;
  }
  return definition.definition_mode.startsWith("zh_")
    ? (definition.content as RichText).text.trim() !== ""
    : englishTextComplete(definition.content as EnglishTextV2);
}

export function wordSenseIssueTarget(
  sense: WordSenseV2,
  senseGroupIds: ReadonlySet<string>,
  grammarIds: ReadonlySet<string>,
  posCode?: WordPosTag,
  partOfSpeechLookup?: PartOfSpeechLookup
): MeaningIssueTarget | undefined {
  if (!cefrLevelComplete(sense.level)) {
    return { node_id: sense.id, field: "level" };
  }
  if (!sense.sense_group_id || !senseGroupIds.has(sense.sense_group_id)) {
    return { node_id: sense.id, field: "sense_group_id" };
  }
  if (
    !sense.sub_pos ||
    (partOfSpeechLookup &&
      (!posCode ||
        !(partOfSpeechLookup.subPartsByPosCode.get(posCode) ?? []).some(
          (subPart) => subPart.code === sense.sub_pos
        )))
  ) {
    return { node_id: sense.id, field: "sub_pos" };
  }
  if (!fixedPercentComplete(sense.frequency)) {
    return { node_id: sense.id, field: "frequency" };
  }
  if (
    sense.definitions.length === 0 ||
    !sense.definitions.some(
      (definition) =>
        definition.definition_mode.startsWith("zh_") &&
        (definition.content as RichText).text.trim() !== ""
    )
  ) {
    return { node_id: sense.id, field: "definitions" };
  }
  for (const definition of sense.definitions) {
    if (!cefrLevelComplete(definition.level)) {
      return { node_id: definition.id, field: "level" };
    }
    if (
      definition.grammar_structure_id !== undefined &&
      !grammarIds.has(definition.grammar_structure_id)
    ) {
      return { node_id: definition.id, field: "grammar_structure_id" };
    }
    if (!definitionComplete(definition, grammarIds)) {
      const field = definition.definition_mode.startsWith("en_")
        ? englishTextIssueField(definition.content as EnglishTextV2)
        : undefined;
      return { node_id: definition.id, field: field ?? "content" };
    }
  }
  for (const relation of sense.relations) {
    if (!relation.target_word_id || !relation.target_sense_id) {
      return { node_id: relation.id, field: "target_word_id" };
    }
    if (!fixedPercentComplete(relation.score)) {
      return { node_id: relation.id, field: "score" };
    }
  }
  return undefined;
}

export function wordSenseComplete(
  sense: WordSenseV2,
  senseGroupIds: ReadonlySet<string>,
  grammarIds: ReadonlySet<string>,
  posCode?: WordPosTag,
  partOfSpeechLookup?: PartOfSpeechLookup
): boolean {
  return !wordSenseIssueTarget(
    sense,
    senseGroupIds,
    grammarIds,
    posCode,
    partOfSpeechLookup
  );
}

export function wordSentenceComplete(
  sentence: WordSentenceV2,
  senseId: string,
  wordId?: string
): boolean {
  const targets = new Set(
    sentence.links.map((link) => `${link.word_id}:${link.sense_id}`)
  );
  const focus = sentence.links.filter((link) => link.role === "focus");
  return Boolean(
    cefrLevelComplete(sentence.level) &&
    englishTextComplete(sentence.en_text) &&
    sentence.zh_text.text.trim() !== "" &&
    targets.size === sentence.links.length &&
    focus.length === 1 &&
    focus[0]?.sense_id === senseId &&
    (wordId ? focus[0].word_id === wordId : focus[0].word_id.length > 0)
  );
}

export function wordSentenceIssueTarget(
  sentence: WordSentenceV2,
  senseId: string,
  wordId?: string
): MeaningIssueTarget | undefined {
  if (!cefrLevelComplete(sentence.level)) {
    return { node_id: sentence.id, field: "level" };
  }
  const englishField = englishTextIssueField(sentence.en_text);
  if (englishField) {
    return { node_id: sentence.id, field: englishField };
  }
  if (!sentence.zh_text.text.trim()) {
    return { node_id: sentence.id, field: "zh_text" };
  }
  return wordSentenceComplete(sentence, senseId, wordId)
    ? undefined
    : { node_id: sentence.id, field: "sentence" };
}

function textCodePointLength(value: string): number {
  return [...value].length;
}

export function validateMeanings(
  content: DraftMeaningsStepContent,
  context: MeaningsValidationContext = {}
): string[] {
  const issues: string[] = [];
  const add = (message: string) => {
    if (!issues.includes(message)) issues.push(message);
  };
  if (content.sense_groups.length === 0) add("至少需要一个语义区间");
  const senseGroupIds = new Set(content.sense_groups.map((group) => group.id));
  const posCodes = new Map(
    context.forms?.pos.map((pos) => [pos.pos_id, pos.pos] as const) ?? []
  );
  for (const [index, group] of content.sense_groups.entries()) {
    const names = [
      [group.name_zh, "中文名"],
      [group.name_en, "英文名"]
    ] as const;
    for (const [name, label] of names) {
      const normalized = name.trim();
      if (!normalized) add(`请填写语义区间 ${index + 1} 的${label}`);
      if (textCodePointLength(normalized) > 200) {
        add(`语义区间 ${index + 1} 的${label}不能超过 200 个字符`);
      }
    }
  }
  for (const pos of content.pos) {
    if (pos.grammar_structures.length === 0)
      add("每个词性至少需要一条语法结构");
    if (
      pos.grammar_structures.some(
        (grammar) => !grammarStructureComplete(grammar, context.headwords)
      )
    ) {
      add("请完善全部语法结构文本");
    }
    const grammarIds = new Set(
      pos.grammar_structures.map((grammar) => grammar.id)
    );
    if (pos.senses.length === 0) add("每个词性至少需要一个词义");
    for (const sense of pos.senses) {
      if (!sense.sense_group_id || !senseGroupIds.has(sense.sense_group_id)) {
        add("请为每个词义选择语义区间");
      }
      const posCode = posCodes.get(pos.pos_id);
      if (
        !sense.sub_pos ||
        (context.partOfSpeechLookup &&
          (!posCode ||
            !(
              context.partOfSpeechLookup.subPartsByPosCode.get(posCode) ?? []
            ).some((subPart) => subPart.code === sense.sub_pos)))
      ) {
        add("请为每个词义选择细分词性");
      }
      if (!fixedPercentComplete(sense.frequency)) {
        add("请填写每个词义的词频（0–100，最多两位小数）");
      }
      const hasChinese = sense.definitions.some(
        (definition) =>
          definition.definition_mode.startsWith("zh_") &&
          (definition.content as RichText).text.trim() !== ""
      );
      if (!hasChinese) add("每个词义至少需要一条中文释义");
      if (
        !cefrLevelComplete(sense.level) ||
        sense.definitions.some((definition) => {
          const grammarInvalid =
            definition.grammar_structure_id !== undefined &&
            !grammarIds.has(definition.grammar_structure_id);
          const chineseInvalid =
            definition.definition_mode.startsWith("zh_") &&
            !(definition.content as RichText).text.trim();
          return (
            !cefrLevelComplete(definition.level) ||
            grammarInvalid ||
            chineseInvalid
          );
        })
      ) {
        add("请完善词义等级、释义文本和语法结构引用");
      }
      for (const definition of sense.definitions) {
        if (
          definition.definition_mode.startsWith("en_") &&
          !englishTextComplete(definition.content as EnglishTextV2)
        ) {
          add("请补齐英文释义的全部启用方言文本");
        }
      }
      for (const sentence of sense.sentences) {
        if (!wordSentenceComplete(sentence, sense.id, context.word_id)) {
          add("请补齐例句的英文文本和汉语译文");
        }
        const focusLinks = sentence.links.filter(
          (link) =>
            link.role === "focus" &&
            link.word_id !== "" &&
            link.sense_id === sense.id
        );
        if (focusLinks.length !== 1)
          add("每条例句必须保留唯一的当前词义主关联");
      }
      for (const relation of sense.relations) {
        if (!relation.target_word_id || !relation.target_sense_id) {
          add("请为每个关系词选择具体词条和词义");
        }
        if (
          !/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(relation.score)
        ) {
          add("关系词分值必须是 0–100 且最多两位小数");
        }
      }
    }
  }
  return issues;
}

export function countPosMeaningIssues(
  pos: WordPosMeaningsV2,
  senseGroupIds: ReadonlySet<string>
): number {
  let count = pos.grammar_structures.length === 0 ? 1 : 0;
  count += pos.grammar_structures.filter((grammar) =>
    grammar.variants.some((variant) => !variant.content.text.trim())
  ).length;
  if (pos.senses.length === 0) count += 1;
  for (const sense of pos.senses) {
    if (!sense.sense_group_id || !senseGroupIds.has(sense.sense_group_id))
      count += 1;
    if (!sense.sub_pos) count += 1;
    if (!sense.frequency?.trim()) count += 1;
    if (
      !sense.definitions.some(
        (definition) =>
          definition.definition_mode.startsWith("zh_") &&
          (definition.content as RichText).text.trim()
      )
    )
      count += 1;
    count += sense.sentences.filter(
      (sentence) =>
        !englishTextComplete(sentence.en_text) || !sentence.zh_text.text.trim()
    ).length;
  }
  return count;
}
