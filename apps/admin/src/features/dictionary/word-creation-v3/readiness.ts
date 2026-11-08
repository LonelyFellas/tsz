import {
  defaultLexiconEditorTranslation as creationDefaultT,
  type LexiconEditorTranslation as CreationTranslation
} from "../i18n/editor";
import { regionalVariants } from "@tsz/shared";
import type {
  WordConcreteFormV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  PersistedWordStep,
  PartOfSpeechCatalogItem
} from "@tsz/types";

import { isV3FormComplete } from "./posCompletion";
import { CEFR_OPTIONS } from "../labels";
import { definitionSummary } from "./meaningsModel";
import { languageSummary, partOfSpeechLabel } from "./presentation";

export type V3ProductProgressKey =
  | "dialect"
  | "parts_of_speech"
  | "forms"
  | "sense_groups"
  | "grammar_structures"
  | "senses"
  | "sentences";

export interface V3ProductProgressDetail {
  key: string;
  label: string;
  count?: number;
  pending?: boolean;
  dialect?: "uk" | "us" | "common";
  items?: readonly { key: string; label: string; pending?: boolean }[];
}

export interface V3ProductProgressRow {
  key: V3ProductProgressKey;
  index: number;
  label: string;
  completed: boolean;
  value?: "完成" | "未完成";
  details: readonly V3ProductProgressDetail[];
  statusDescription?: string;
  count?: number;
  /** 该项归属的向导步骤；左栏用它判断哪一行对应当前步骤。 */
  step: PersistedWordStep;
}

export interface V3ProductProgressInput {
  wordId: string;
  language: string;
  partOfSpeechCatalog?: readonly PartOfSpeechCatalogItem[];
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
  completedSteps: readonly PersistedWordStep[];
  forms: DraftFormsStepContentV3;
  meanings: DraftMeaningsStepContentV3 | DraftMeaningsStepContentWritableV3;
}

// 同类型内比较拼写和每条发音的全部音标；不同类型（如动名词/现在分词）分别计数。
// 英美共用等价于两侧填写相同内容，原形可跨词性合并。
// 原形的空音标也参与比较，但不把未填写拼写的占位条目合并。
function formIdentity(form: WordConcreteFormV3): string {
  const variants =
    form.regional_variants.mode === "common"
      ? [form.regional_variants.common, form.regional_variants.common]
      : regionalVariants(form.regional_variants);
  if (
    variants.some(
      (variant) =>
        !variant.spelling.trim() ||
        (form.form_type !== "base" &&
          (!variant.pronunciations.length ||
            variant.pronunciations.some(
              (pronunciation) => !pronunciation.dict_phonetic.trim()
            )))
    )
  ) {
    return `unfilled:${form.id}`;
  }
  return JSON.stringify([
    form.form_type,
    ...(form.regional_variants.mode === "uk_us_many"
      ? [form.regional_variants.uk.length]
      : []),
    variants.map((variant) => [
      variant.spelling.trim(),
      [
        ...new Set(
          variant.pronunciations
            .map((pronunciation) => [
              pronunciation.dict_phonetic.trim(),
              pronunciation.actual_pron.trim(),
              pronunciation.synthesis?.ipa.trim() ?? "",
              pronunciation.synthesis?.ups.trim() ?? ""
            ])
            // 尚无发音行与全部音标为空的发音行等价。
            .filter((phonetics) => phonetics.some(Boolean))
            .map((phonetics) => JSON.stringify(phonetics))
        )
      ].sort()
    ])
  ]);
}

/** 窄屏「完成情况」入口上的计数，如 "2/7"。 */
export function v3ProductProgressBadge(
  rows: readonly V3ProductProgressRow[]
): string {
  return `${rows.filter((row) => row.completed).length}/${rows.length}`;
}

export function buildV3ProductProgress(
  {
    language,
    partOfSpeechCatalog = [],
    dirtySteps = { forms: false, meanings: false },
    completedSteps,
    forms,
    meanings
  }: V3ProductProgressInput,
  t: CreationTranslation = creationDefaultT,
  interfaceLocale = "zh-Hans"
): V3ProductProgressRow[] {
  const completed = new Set(completedSteps);
  const allIdentities = new Set<string>();
  let allFormsComplete = forms.pos.length > 0;
  const formCounts = new Map(
    forms.pos.map((pos) => {
      const identities = new Set(pos.forms.map(formIdentity));
      if (
        !pos.forms.length ||
        !pos.forms.every(isV3FormComplete) ||
        pos.form_groups.some((group) => group.members.length === 0)
      )
        allFormsComplete = false;
      for (const identity of identities) allIdentities.add(identity);
      return [pos.pos_id, identities.size] as const;
    })
  );
  const grammarEntries = meanings.pos.flatMap((pos) =>
    pos.grammar_structures.map((grammar) => ({ pos, grammar }))
  );
  const senseEntries = meanings.pos.flatMap((pos) =>
    pos.senses.map((sense) => ({ pos, sense }))
  );
  const sentenceEntries = senseEntries.flatMap(({ pos, sense }) =>
    sense.sentences.map((sentence) => ({ pos, sense, sentence }))
  );

  const languageInfo = languageSummary(language, t, interfaceLocale);
  const catalogNames = new Map(
    partOfSpeechCatalog.map((part) => [
      part.code,
      interfaceLocale.startsWith("en")
        ? part.name_en.trim() || part.name_zh.trim()
        : part.name_zh.trim() || part.name_en.trim()
    ])
  );
  const meaningsByPos = new Map(meanings.pos.map((pos) => [pos.pos_id, pos]));
  const formPosIds = new Set(forms.pos.map((pos) => pos.pos_id));
  const positions = [
    ...forms.pos.map((pos) => ({
      key: pos.pos_id,
      label:
        catalogNames.get(pos.pos) || partOfSpeechLabel(pos.pos, t, pos.pos),
      forms: pos.forms,
      meanings: meaningsByPos.get(pos.pos_id)
    })),
    ...meanings.pos
      .filter((pos) => !formPosIds.has(pos.pos_id))
      .map((pos) => ({
        key: pos.pos_id,
        label: t("creation_unrecognised_part_of_speech"),
        forms: [],
        meanings: pos
      }))
  ];
  const hasUnmatchedPos = meanings.pos.some(
    (pos) => !formPosIds.has(pos.pos_id)
  );
  const distinguish =
    language === "en" &&
    forms.pos.some((pos) =>
      pos.form_groups.some(
        (group) =>
          group.dialect_rules.spelling_mode === "distinguish" ||
          group.dialect_rules.phonetic_mode === "distinguish"
      )
    );
  const levelCounts = new Map<string, number>();
  for (const { sentence } of sentenceEntries) {
    const level = CEFR_OPTIONS.some((option) => option.value === sentence.level)
      ? sentence.level
      : "ungraded";
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }
  const details: Record<V3ProductProgressKey, V3ProductProgressDetail[]> = {
    dialect: [
      { key: "language", label: languageInfo.label },
      ...(distinguish
        ? ([
            { key: "uk", label: "BrE", dialect: "uk" },
            { key: "us", label: "AmE", dialect: "us" }
          ] as const)
        : language === "en" && forms.pos.length > 0
          ? [
              {
                key: "common",
                label: t("presentation_dialect_label_common"),
                dialect: "common" as const
              }
            ]
          : [])
    ],
    parts_of_speech: positions
      .filter((pos) => formPosIds.has(pos.key))
      .map(({ key, label }) => ({ key, label })),
    forms: positions
      .filter((pos) => formPosIds.has(pos.key))
      .map((pos) => ({
        key: pos.key,
        label: pos.label,
        count: formCounts.get(pos.key) ?? 0
      })),
    sense_groups: meanings.sense_groups.map((group) => ({
      key: group.id,
      label:
        group.name_zh.trim() ||
        group.name_en.trim() ||
        t("creation_sense_group_not_entered"),
      pending: !group.name_zh.trim() && !group.name_en.trim(),
      count: senseEntries.filter(
        ({ sense }) => sense.sense_group_id === group.id
      ).length
    })),
    grammar_structures: positions.map((pos) => ({
      key: pos.key,
      label: pos.label,
      count: pos.meanings?.grammar_structures.length ?? 0
    })),
    senses: positions.map((pos) => ({
      key: pos.key,
      label: pos.label,
      count: pos.meanings?.senses.length ?? 0,
      items: (pos.meanings?.senses ?? []).map((sense) => ({
        key: sense.id,
        label: definitionSummary(sense, t("empty_definition")),
        pending:
          definitionSummary(sense, t("empty_definition")) ===
          t("panel_definition_not_entered")
      }))
    })),
    sentences: [
      ...CEFR_OPTIONS.flatMap(({ value: level }) => {
        const count = levelCounts.get(level) ?? 0;
        return count > 0 ? [{ key: level, label: level, count }] : [];
      }),
      ...(levelCounts.has("ungraded")
        ? [
            {
              key: "ungraded",
              label: t("creation_ungraded"),
              count: levelCounts.get("ungraded")!
            }
          ]
        : [])
    ]
  };

  const rows: Omit<V3ProductProgressRow, "details" | "step">[] = [
    {
      key: "dialect",
      index: 1,
      label: t("creation_language_identification"),
      completed: completed.has("basics") && languageInfo.identified,
      value:
        completed.has("basics") && languageInfo.identified ? "完成" : "未完成"
    },
    {
      key: "parts_of_speech",
      index: 2,
      label: t("panel_part_of_speech"),
      completed: completed.has("forms"),
      count: forms.pos.length
    },
    {
      key: "forms",
      index: 3,
      label: t("creation_form_changes"),
      completed: allFormsComplete,
      count: allIdentities.size,
      statusDescription: t(
        "creation_includes_base_forms_forms_with_the_same_type_spelling_and_all_phonetics_are_counted_togeth"
      )
    },
    {
      key: "sense_groups",
      index: 4,
      label: t("panel_sense_group_2"),
      completed: completed.has("meanings"),
      count: meanings.sense_groups.length
    },
    {
      key: "grammar_structures",
      index: 5,
      label: t("snapshot_grammar"),
      completed: completed.has("meanings"),
      count: grammarEntries.length
    },
    {
      key: "senses",
      index: 6,
      label: t("creation_meanings"),
      completed: completed.has("meanings"),
      count: senseEntries.length
    },
    {
      key: "sentences",
      index: 7,
      label: t("panel_examples_2"),
      completed: completed.has("meanings"),
      count: sentenceEntries.length
    }
  ];
  return rows.map((row) => {
    const step =
      row.key === "dialect"
        ? "basics"
        : row.key === "parts_of_speech" || row.key === "forms"
          ? "forms"
          : "meanings";
    const dirty = step !== "basics" && dirtySteps[step];
    return {
      ...row,
      step,
      completed:
        row.completed &&
        (row.key === "forms" || !dirty) &&
        !(step === "meanings" && hasUnmatchedPos),
      details: details[row.key],
      ...(dirty
        ? {
            statusDescription:
              row.key === "forms"
                ? t("creation_based_on_current_unsaved_input")
                : t("creation_editing_completion_has_not_been_confirmed")
          }
        : {})
    };
  });
}
