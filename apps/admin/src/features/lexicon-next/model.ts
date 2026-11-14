import type {
  NextDraft,
  NextGrammarStructure,
  NextSense,
  NextGrammarIssue,
  PartOfSpeechCatalogResponse,
  NextEntryView,
  NextForm,
  NextLanguageCapability,
  SharedFormsStepContentV3
} from "@tsz/types";

export const localeLabels: Record<string, string> = {
  "en-GB": "英式英语",
  "en-US": "美式英语",
  en: "通用英语",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁体中文"
};

export const removePosDescription =
  "会移除此词性下的词形、语法结构和所有语言的词义、解释及译词。保存后生效。";

export function replaceFormEditor(
  draft: NextDraft,
  form_editor: SharedFormsStepContentV3
): NextDraft {
  const removed = new Set(
    draft.form_editor?.pos
      .filter((pos) => !form_editor.pos.some((next) => next.pos === pos.pos))
      .map((pos) => pos.pos)
  );
  return {
    ...draft,
    form_editor,
    ...(draft.grammar_structures
      ? {
          grammar_structures: draft.grammar_structures.filter(
            (grammar) => !removed.has(grammar.part_of_speech)
          )
        }
      : {}),
    senses: draft.senses.filter(
      (sense) => !removed.has(sense.part_of_speech ?? "")
    )
  };
}

export function draftForms(draft: NextDraft): NextForm[] {
  return [
    ...draft.forms,
    ...(
      draft.form_editor?.contents.flatMap((content) => {
        const regional = content.regional_variants;
        const row = (
          variant: { id: string; spelling: string },
          locale: string
        ): NextForm => ({ id: variant.id, locale, text: variant.spelling });
        if (regional.mode === "common") return [row(regional.common, "en")];
        return (["uk", "us"] as const).flatMap((side) =>
          (regional.mode === "uk_us_many"
            ? regional[side]
            : [regional[side]]
          ).map((variant) => row(variant, side === "uk" ? "en-GB" : "en-US"))
        );
      }) ?? []
    ).filter((row) => row.text.trim())
  ];
}

export function initialTargetLocale(
  draft: NextDraft,
  language: NextLanguageCapability
): string {
  const forms = draftForms(draft);
  const definitions = draft.senses.flatMap((sense) => sense.definitions);
  const existingLocale = (rows: { locale: string; text: string }[]) =>
    language.target_locales.find((locale) =>
      rows.some((row) => row.locale === locale && row.text.trim())
    );
  return (
    existingLocale(forms) ??
    existingLocale(definitions) ??
    language.target_locales[0]!
  );
}

/** Local preview only; never replaces the complete editable draft. */
export function previewDraft(
  draft: NextDraft,
  target: string,
  medium: string,
  catalog?: PartOfSpeechCatalogResponse
): NextEntryView {
  const targetRows = <T extends { locale: string }>(rows: T[]) => {
    const exact = rows.filter((row) => row.locale === target);
    return exact.length
      ? exact
      : rows.filter((row) => row.locale === target.split("-")[0]);
  };
  const forms = targetRows(draftForms(draft));
  return {
    ...(draft.sense_groups !== undefined
      ? { sense_groups: draft.sense_groups }
      : {}),
    ...(draft.grammar_structures !== undefined
      ? {
          grammar_structures: draft.grammar_structures
            .filter((grammar) =>
              grammarSubPosValid(
                grammar.part_of_speech,
                grammar.sub_pos,
                catalog
              )
            )
            .map((grammar) => ({
              ...grammar,
              variants: targetRows(grammar.variants)
            })),
          grammar_issues: grammarBindingIssues(draft, catalog)
        }
      : {}),
    entry_id: "",
    revision: 0,
    target_locale: target,
    medium_locale: medium,
    forms,
    missing_forms: !forms.length,
    senses: draft.senses.map((sense) => {
      const validReferences = (
        definition: (typeof sense.definitions)[number]
      ) => {
        if (
          !definition.grammar_structure_id ||
          draft.grammar_structures?.some(
            (g) =>
              g.id === definition.grammar_structure_id &&
              grammarMatchesSense(g, sense, catalog)
          )
        )
          return definition;
        const next = { ...definition };
        delete next.grammar_structure_id;
        return next;
      };
      const target_definitions = targetRows(sense.definitions).map(
        validReferences
      );
      const medium_definitions = sense.definitions
        .filter((row) => row.locale === medium)
        .map(validReferences);
      const equivalents = sense.equivalents.filter(
        (row) => row.locale === medium
      );
      return {
        id: sense.id,
        ...(sense.sense_group_id
          ? { sense_group_id: sense.sense_group_id }
          : {}),
        target_definitions,
        medium_definitions,
        equivalents,
        missing_target_definitions: !target_definitions.length,
        missing_medium_definitions: !medium_definitions.length,
        missing_equivalents: !equivalents.length
      };
    })
  };
}

export function draftProblem(draft: NextDraft): string | null {
  for (const group of draft.sense_groups ?? []) {
    if (
      [group.name_zh, group.name_en].some(
        (name) => [...name].length > 200 || /\p{Cc}/u.test(name)
      )
    )
      return "语义区间名称最多 200 个字符，且不能包含换行或控制字符。";
  }
  const texts: {
    text: string;
    label: string;
    max: number;
    multiline?: boolean;
  }[] = [
    { text: draft.headword, label: "词头", max: 200 },
    ...draft.forms.map((row) => ({
      ...row,
      label: `${localeLabels[row.locale] ?? row.locale}词形`,
      max: 200
    })),
    ...draft.senses.flatMap((sense, index) => [
      ...sense.definitions.map((row) => ({
        ...row,
        label: `义项 ${index + 1} · ${localeLabels[row.locale] ?? row.locale}释义`,
        max: 5000,
        multiline: true
      })),
      ...sense.equivalents.map((row) => ({
        ...row,
        label: `义项 ${index + 1} · ${localeLabels[row.locale] ?? row.locale}译词`,
        max: 200
      }))
    ])
  ];
  const invalid = texts.find(
    (row) => !row.text.trim() || [...row.text].length > row.max
  );
  if (invalid)
    return `${invalid.label}不能为空，且最多 ${invalid.max} 个字符；不需要的行请删除。`;
  const control = texts.find((row) =>
    /\p{Cc}/u.test(row.multiline ? row.text.replace(/[\r\n]/g, "") : row.text)
  );
  if (control)
    return `${control.label}${control.multiline ? "不能包含制表符或其他控制字符。" : "必须为单行，且不能包含制表符或其他控制字符。"}`;
  if (
    texts.length - 1 + draft.senses.length + (draft.sense_groups?.length ?? 0) >
    500
  )
    return "草稿最多包含 500 个内容节点，请删除多余内容。";
  return null;
}

function grammarSubPosValid(
  pos: string | null,
  subPos: string | undefined,
  catalog: PartOfSpeechCatalogResponse | undefined
): boolean {
  const part = catalog?.items.find((item) => item.code === pos);
  if (!part) return false;
  return subPos
    ? part.sub_parts.some((item) => item.code === subPos)
    : part.sub_parts.length === 0;
}

export function grammarMatchesSense(
  grammar: NextGrammarStructure,
  sense: NextSense,
  catalog?: PartOfSpeechCatalogResponse
): boolean {
  return (
    grammar.part_of_speech === sense.part_of_speech &&
    (grammar.sub_pos ?? "") === (sense.sub_pos ?? "") &&
    grammarSubPosValid(grammar.part_of_speech, grammar.sub_pos, catalog)
  );
}
export function grammarText(
  grammar: NextGrammarStructure,
  locale: string
): string {
  return (
    (
      grammar.variants.find((variant) => variant.locale === locale) ??
      grammar.variants.find((variant) => variant.locale === "en")
    )?.content.text ?? ""
  );
}
export function grammarBindingIssues(
  draft: NextDraft,
  catalog?: PartOfSpeechCatalogResponse
): NextGrammarIssue[] {
  if (draft.grammar_structures === undefined) return [];
  const issues: NextGrammarIssue[] = [];
  for (const grammar of draft.grammar_structures) {
    if (!grammarSubPosValid(grammar.part_of_speech, grammar.sub_pos, catalog))
      issues.push({
        node_id: grammar.id,
        field: "sub_pos",
        message: "语法结构需要绑定当前基本词性下有效的细分词性"
      });
    if (
      !grammar.variants.length ||
      grammar.variants.some((v) => !v.content.text.trim()) ||
      (grammar.variants.some((v) => v.locale !== "en") &&
        grammar.variants.length !== 2)
    )
      issues.push({
        node_id: grammar.id,
        field: "variants",
        message: "请完整填写语法结构的英美内容"
      });
  }
  for (const sense of draft.senses) {
    if (!grammarSubPosValid(sense.part_of_speech, sense.sub_pos, catalog))
      issues.push({
        node_id: sense.id,
        field: "sub_pos",
        message: "请选择义项的细分词性"
      });
    for (const definition of sense.definitions) {
      const grammar = draft.grammar_structures.find(
        (row) => row.id === definition.grammar_structure_id
      );
      if (!grammar || !grammarMatchesSense(grammar, sense, catalog))
        issues.push({
          node_id: definition.id,
          field: "grammar_structure_id",
          message: "请选择与义项细分词性匹配的语法结构"
        });
    }
  }
  return issues;
}
