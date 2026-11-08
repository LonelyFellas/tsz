import {
  defaultLexiconEditorTranslation as creationDefaultT,
  type LexiconEditorTranslation as CreationTranslation,
  type LexiconEditorKey as CreationKey
} from "../i18n/editor";
import { synthesisForLocale } from "@tsz/shared";
import {
  defaultLexiconEditorTranslation,
  type LexiconEditorKey,
  type LexiconEditorTranslation
} from "../i18n/editor";
import type {
  Dialect,
  PronunciationSynthesisV3,
  FormsImpactNodeTypeV3,
  PronunciationStyle,
  WordFormTypeV3
} from "@tsz/types";

const FORM_TYPE_LABEL: Record<WordFormTypeV3, CreationKey> = {
  base: "creation_base_form",
  third_person_singular: "creation_third_person_singular",
  present_participle: "creation_present_participle",
  past_tense: "creation_past_tense",
  past_participle: "creation_past_participle",
  plural: "creation_plural",
  comparative: "creation_comparative",
  superlative: "creation_superlative"
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

const PART_OF_SPEECH_LABEL: Record<string, CreationKey> = {
  noun: "creation_noun",
  pronoun: "creation_pronoun",
  verb: "creation_verb",
  adjective: "creation_adjective",
  adverb: "creation_adverb",
  preposition: "creation_preposition",
  article: "creation_article",
  determiner: "creation_determiner",
  conjunction: "creation_conjunction",
  numeral: "creation_numeral",
  interjection: "creation_interjection"
};

const SUB_PART_OF_SPEECH_LABEL: Record<string, CreationKey> = {
  "V-T": "creation_transitive_verb",
  "V-I": "creation_intransitive_verb",
  "V-LINK": "creation_linking_verb",
  AUX: "creation_auxiliary_verb",
  MODAL: "creation_modal_verb",
  ADJ: "creation_adjective",
  ADV: "creation_adverb",
  "N-COUNT": "creation_countable_noun",
  "N-UNCOUNT": "creation_uncountable_noun",
  "N-PROPER": "creation_proper_noun",
  "N-PLURAL": "creation_plural_noun",
  "N-SING": "creation_singular_noun",
  PRON: "creation_pronoun",
  PREP: "creation_preposition",
  CONJ: "creation_conjunction",
  DET: "creation_determiner",
  ART: "creation_article",
  NUM: "creation_numeral",
  INT: "creation_interjection"
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

export function languageSummary(
  language: string,
  t: CreationTranslation = creationDefaultT,
  interfaceLocale = "zh-Hans"
): {
  label: string;
  identified: boolean;
} {
  const code = language.trim();
  if (!code)
    return { label: t("creation_unrecognised_language"), identified: false };
  try {
    const zh = languageNamesZh.of(code);
    const en = languageNamesEn.of(code);
    if (zh && en) {
      const label = interfaceLocale.startsWith("en")
        ? en
        : interfaceLocale === "zh-Hans"
          ? `${zh} ${en}`
          : `${new Intl.DisplayNames([interfaceLocale], { type: "language", fallback: "none" }).of(code) ?? zh} ${en}`;
      return { label, identified: true };
    }
  } catch {
    // 未知/不合法的代码只作展示兜底，不能被显示成默认英语。
  }
  return {
    label: t("creation_language_unknown_code", { code }),
    identified: false
  };
}

export function formTypeLabel(
  value: WordFormTypeV3,
  t: CreationTranslation = creationDefaultT
): string {
  return Object.hasOwn(FORM_TYPE_LABEL, value)
    ? t(FORM_TYPE_LABEL[value]!)
    : /^[a-z][a-z0-9_]{0,31}$/.test(value)
      ? value
      : t("creation_unrecognised_form_type");
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

export function partOfSpeechLabel(
  value: string,
  t: CreationTranslation = creationDefaultT,
  fallback?: string
): string {
  return PART_OF_SPEECH_LABEL[value]
    ? t(PART_OF_SPEECH_LABEL[value]!)
    : (fallback ?? t("creation_other_part_of_speech"));
}

export function subPartOfSpeechLabel(
  value: string,
  t: CreationTranslation = creationDefaultT
): string {
  return SUB_PART_OF_SPEECH_LABEL[value]
    ? t(SUB_PART_OF_SPEECH_LABEL[value]!)
    : t("creation_other_subcategory");
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

export function definitionModeLabel(
  value: string,
  t: CreationTranslation = creationDefaultT
): string {
  return (
    {
      zh_definition: t("snapshot_definition_zh"),
      zh_sentence: t("snapshot_sentence_zh"),
      en_definition: t("snapshot_definition_en"),
      en_sentence: t("snapshot_sentence_en")
    }[value] ?? t("creation_unrecognised_content_mode")
  );
}

export function reviewSynthesisLabel(
  synthesis: PronunciationSynthesisV3,
  dialect: Dialect,
  t: LexiconEditorTranslation
) {
  if (synthesis.use_spelling) return t("review_spelling_source");
  const name = `Azure ${synthesis.alphabet.toUpperCase()}`;
  const empty = t("review_not_entered");
  if (!synthesis.uk && !synthesis.us)
    return t("review_synthesis_value", {
      name,
      value: synthesis[synthesis.alphabet] || empty
    });
  const uk =
    synthesisForLocale(synthesis, "en-GB", dialect)[synthesis.alphabet] ||
    empty;
  const us =
    synthesisForLocale(synthesis, "en-US", dialect)[synthesis.alphabet] ||
    empty;
  if (dialect !== "common")
    return t("review_synthesis_dialect", {
      name,
      dialect: dialectLabel(dialect, t),
      value: dialect === "uk" ? uk : us
    });
  return t("review_synthesis_both", { name, uk, us });
}
