import type {
  NextDraft,
  NextEntryView,
  NextForm,
  NextLanguageCapability
} from "@tsz/types";

export const localeLabels: Record<string, string> = {
  "en-GB": "英式英语",
  "en-US": "美式英语",
  en: "通用英语",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁体中文"
};

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
  medium: string
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
    entry_id: "",
    revision: 0,
    target_locale: target,
    medium_locale: medium,
    forms,
    missing_forms: !forms.length,
    senses: draft.senses.map((sense) => {
      const target_definitions = targetRows(sense.definitions);
      const medium_definitions = sense.definitions.filter(
        (row) => row.locale === medium
      );
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
