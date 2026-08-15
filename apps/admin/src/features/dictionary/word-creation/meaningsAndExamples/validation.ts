import type {
  DraftMeaningsStepContent,
  EnglishTextV2,
  RichText,
  WordPosMeaningsV2
} from "@tsz/types";

export function englishTextComplete(value: EnglishTextV2): boolean {
  if (value.mode === "unified") return value.common.value.text.trim() !== "";
  return (["uk", "us"] as const).every((dialect) => {
    const slot = value[dialect];
    return slot.state === "ready" && slot.variant.value.text.trim() !== "";
  });
}

function textCodePointLength(value: string): number {
  return [...value].length;
}

export function validateMeanings(content: DraftMeaningsStepContent): string[] {
  const issues: string[] = [];
  const add = (message: string) => {
    if (!issues.includes(message)) issues.push(message);
  };
  if (content.sense_groups.length === 0) add("至少需要一个语义区间");
  const senseGroupIds = new Set(content.sense_groups.map((group) => group.id));
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
      pos.grammar_structures.some((grammar) =>
        grammar.variants.some((variant) => !variant.content.text.trim())
      )
    ) {
      add("请完善全部语法结构文本");
    }
    if (pos.senses.length === 0) add("每个词性至少需要一个词义");
    for (const sense of pos.senses) {
      if (!sense.sense_group_id || !senseGroupIds.has(sense.sense_group_id)) {
        add("请为每个词义选择语义区间");
      }
      if (!sense.sub_pos) add("请为每个词义选择细分词性");
      if (sense.frequency === undefined || sense.frequency.trim() === "") {
        add("请填写每个词义的词频（0–100，最多两位小数）");
      }
      const hasChinese = sense.definitions.some(
        (definition) =>
          definition.definition_mode.startsWith("zh_") &&
          (definition.content as RichText).text.trim() !== ""
      );
      if (!hasChinese) add("每个词义至少需要一条中文释义");
      for (const definition of sense.definitions) {
        if (
          definition.definition_mode.startsWith("en_") &&
          !englishTextComplete(definition.content as EnglishTextV2)
        ) {
          add("请补齐英文释义的全部启用方言文本");
        }
      }
      for (const sentence of sense.sentences) {
        if (
          !englishTextComplete(sentence.en_text) ||
          !sentence.zh_text.text.trim()
        ) {
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
