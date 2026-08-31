import type {
  DraftMeaningsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  WordConcreteFormV3,
  WordPosFormsV3,
  WordPosMeaningsV3,
  WordPosMeaningsWritableV3
} from "@tsz/types";

function formComplete(form: WordConcreteFormV3) {
  const variants =
    form.regional_variants.mode === "common"
      ? [form.regional_variants.common]
      : [form.regional_variants.uk, form.regional_variants.us];
  return variants.every(
    (variant) =>
      variant.spelling.trim() !== "" &&
      variant.pronunciations.length > 0 &&
      variant.pronunciations.every(
        (pronunciation) =>
          pronunciation.dict_phonetic.trim() !== "" &&
          pronunciation.actual_pron.trim() !== "" &&
          pronunciation.style !== undefined
      )
  );
}

/**
 * POS 页签只提示还有多少块词形内容没填，不重复计算同一词形里的空字段。
 */
export function countV3PosFormIncomplete(pos: WordPosFormsV3): number {
  return (
    pos.form_groups.filter((group) => group.members.length === 0).length +
    pos.forms.filter((form) => !formComplete(form)).length
  );
}

type MeaningsContent =
  DraftMeaningsStepContentV3 | DraftMeaningsStepContentWritableV3;
type MeaningsPos = WordPosMeaningsV3 | WordPosMeaningsWritableV3;

function englishTextComplete(
  value: MeaningsPos["senses"][number]["sentences"][number]["en_text"]
) {
  if (value.mode === "unified") return value.common.value.text.trim() !== "";
  return [value.uk, value.us].every(
    (slot) => slot.state === "ready" && slot.variant.value.text.trim() !== ""
  );
}

function hasChineseDefinition(sense: MeaningsPos["senses"][number]) {
  return sense.definitions.some(
    (definition) =>
      (definition.definition_mode === "zh_definition" ||
        definition.definition_mode === "zh_sentence") &&
      definition.content.text.trim() !== ""
  );
}

/**
 * Step 3 页签使用本地未填单元计数；范围/枚举/引用错误仍由发布校验负责。
 */
export function countV3PosMeaningIncomplete(
  pos: MeaningsPos,
  content: MeaningsContent
): number {
  const senseGroupIds = new Set(content.sense_groups.map((group) => group.id));
  let count = pos.grammar_structures.length === 0 ? 1 : 0;
  count += pos.grammar_structures.filter((grammar) =>
    grammar.variants.some((variant) => !variant.content.text.trim())
  ).length;
  if (pos.senses.length === 0) count += 1;
  for (const sense of pos.senses) {
    if (!sense.sense_group_id || !senseGroupIds.has(sense.sense_group_id)) {
      count += 1;
    }
    if (!sense.sub_pos) count += 1;
    if (!sense.frequency?.trim()) count += 1;
    if (!hasChineseDefinition(sense)) count += 1;
    count += sense.sentences.filter(
      (sentence) =>
        !englishTextComplete(sentence.en_text) || !sentence.zh_text.text.trim()
    ).length;
  }
  return count;
}
