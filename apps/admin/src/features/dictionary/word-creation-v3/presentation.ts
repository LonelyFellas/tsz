import {
  defaultLexiconEditorTranslation,
  type LexiconEditorKey,
  type LexiconEditorTranslation
} from "../i18n/editor";
import type {
  Dialect,
  FormsImpactNodeTypeV3,
  PronunciationStyle,
  WordFormTypeV3
} from "@tsz/types";

const FORM_TYPE_LABEL: Record<WordFormTypeV3, string> = {
  base: "原形",
  third_person_singular: "第三人称单数",
  present_participle: "现在分词",
  past_tense: "过去式",
  past_participle: "过去分词",
  plural: "复数",
  comparative: "比较级",
  superlative: "最高级"
};

const DIALECT_LABEL: Record<Dialect, LexiconEditorKey> = {
  common: "presentation_dialect_label_common",
  uk: "presentation_dialect_label_uk",
  us: "presentation_dialect_label_us"
};

const PRONUNCIATION_STYLE_LABEL: Record<PronunciationStyle, LexiconEditorKey> =
  {
    normal: "presentation_pronunciation_style_label_normal",
    citation: "presentation_pronunciation_style_label_citation",
    strong: "presentation_pronunciation_style_label_strong",
    weak: "presentation_pronunciation_style_label_weak"
  };

const PART_OF_SPEECH_LABEL: Record<string, string> = {
  noun: "名词",
  pronoun: "代词",
  verb: "动词",
  adjective: "形容词",
  adverb: "副词",
  preposition: "介词",
  article: "冠词",
  determiner: "限定词",
  conjunction: "连词",
  numeral: "数词",
  interjection: "感叹词"
};

const SUB_PART_OF_SPEECH_LABEL: Record<string, string> = {
  "V-T": "及物动词",
  "V-I": "不及物动词",
  "V-LINK": "系动词",
  AUX: "助动词",
  MODAL: "情态动词",
  ADJ: "形容词",
  ADV: "副词",
  "N-COUNT": "可数名词",
  "N-UNCOUNT": "不可数名词",
  "N-PROPER": "专有名词",
  "N-PLURAL": "复数名词",
  "N-SING": "单数名词",
  PRON: "代词",
  PREP: "介词",
  CONJ: "连词",
  DET: "限定词",
  ART: "冠词",
  NUM: "数词",
  INT: "感叹词"
};

const RELATION_LABEL: Record<string, LexiconEditorKey> = {
  synonym: "presentation_relation_label_synonym",
  antonym: "presentation_relation_label_antonym",
  derivative: "presentation_relation_label_derivative",
  derived: "presentation_relation_label_derived"
};

const IMPACT_LABEL: Record<FormsImpactNodeTypeV3, LexiconEditorKey> = {
  pos: "presentation_impact_label_pos",
  form_group: "presentation_impact_label_form_group",
  membership: "presentation_impact_label_membership",
  form: "presentation_impact_label_form",
  variant: "presentation_impact_label_variant",
  pronunciation: "presentation_impact_label_pronunciation",
  phrase_component_usage: "presentation_impact_label_phrase_component_usage",
  surface: "presentation_impact_label_surface",
  publication: "presentation_impact_label_publication",
  grammar_structure: "presentation_impact_label_grammar_structure",
  text_variant: "presentation_impact_label_text_variant",
  sense: "presentation_impact_label_sense",
  definition: "presentation_impact_label_definition",
  sentence: "presentation_impact_label_sentence",
  relation: "presentation_impact_label_relation"
};

const languageNamesZh = new Intl.DisplayNames(["zh-CN"], {
  type: "language",
  fallback: "none"
});
const languageNamesEn = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "none"
});

export function languageSummary(language: string): {
  label: string;
  identified: boolean;
} {
  const code = language.trim();
  if (!code) return { label: "未识别语言", identified: false };
  try {
    const zh = languageNamesZh.of(code);
    const en = languageNamesEn.of(code);
    if (zh && en) return { label: `${zh} ${en}`, identified: true };
  } catch {
    // 未知/不合法的代码只作展示兜底，不能被显示成默认英语。
  }
  return { label: `${code}（未识别语言）`, identified: false };
}

export function formTypeLabel(value: WordFormTypeV3): string {
  return Object.hasOwn(FORM_TYPE_LABEL, value)
    ? FORM_TYPE_LABEL[value]!
    : /^[a-z][a-z0-9_]{0,31}$/.test(value)
      ? value
      : "未识别词形类型";
}

export function dialectLabel(
  value: Dialect,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  const key = DIALECT_LABEL[value];
  return key ? t(key) : t("presentation_unknown_dialectLabel");
}

export function pronunciationStyleLabel(
  value: PronunciationStyle,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  const key = PRONUNCIATION_STYLE_LABEL[value];
  return key ? t(key) : t("presentation_unknown_pronunciationStyleLabel");
}

export function partOfSpeechLabel(value: string): string {
  return PART_OF_SPEECH_LABEL[value] ?? "其他词性";
}

export function subPartOfSpeechLabel(value: string): string {
  return SUB_PART_OF_SPEECH_LABEL[value] ?? "其他细分词性";
}

export function relationLabel(
  value: string,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  const key = RELATION_LABEL[value];
  return key ? t(key) : t("presentation_unknown_relationLabel");
}

export function sentenceLinkRoleLabel(
  value: string,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  if (value === "focus" || value === "head")
    return t("presentation_link_primary");
  if (value === "context") return t("presentation_link_context");
  return t("presentation_link_other");
}

const IMPACT_REASON_LABEL: Record<string, LexiconEditorKey> = {
  node_removed_from_draft:
    "presentation_impact_reason_label_node_removed_from_draft",
  downstream_node_removed_with_pos:
    "presentation_impact_reason_label_downstream_node_removed_with_pos",
  form_group_binding_cleared:
    "presentation_impact_reason_label_form_group_binding_cleared"
};

export function impactReasonLabel(
  value: string,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  if (/[\u3400-\u9fff]/u.test(value)) return value;
  return t(IMPACT_REASON_LABEL[value] ?? "presentation_impact_other");
}

export type FormsImpactSummaryGroup = {
  reason: string;
  reasonLabel: string;
  total: number;
  parts: { nodeType: FormsImpactNodeTypeV3; label: string; count: number }[];
};

/**
 * 影响清单逐条铺开时会出现几十行同一句话（后端按节点粒度返回，一个词性下的
 * 每条发音、每个地区拼写都算一条）。按「原因 → 节点类型」聚合成计数，
 * 保留原有的类型与原因用词，只把重复折起来。
 */
export function summarizeFormsImpact(
  affected: readonly { node_type: FormsImpactNodeTypeV3; reason: string }[]
): FormsImpactSummaryGroup[] {
  const groups = new Map<string, Map<FormsImpactNodeTypeV3, number>>();
  for (const item of affected) {
    const byType = groups.get(item.reason) ?? new Map();
    byType.set(item.node_type, (byType.get(item.node_type) ?? 0) + 1);
    groups.set(item.reason, byType);
  }
  return [...groups.entries()].map(([reason, byType]) => {
    const parts = [...byType.entries()]
      .map(([nodeType, count]) => ({
        nodeType,
        label: impactTypeLabel(nodeType),
        count
      }))
      .sort(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh")
      );
    return {
      reason,
      reasonLabel: impactReasonLabel(reason),
      total: parts.reduce((sum, part) => sum + part.count, 0),
      parts
    };
  });
}

export function impactTypeLabel(
  value: FormsImpactNodeTypeV3,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  const key = IMPACT_LABEL[value];
  return key ? t(key) : t("presentation_unknown_impactTypeLabel");
}

export function definitionModeLabel(value: string): string {
  return (
    {
      zh_definition: "中文释义",
      zh_sentence: "中文例句",
      en_definition: "英文释义",
      en_sentence: "英文例句"
    }[value] ?? "未识别内容方式"
  );
}
