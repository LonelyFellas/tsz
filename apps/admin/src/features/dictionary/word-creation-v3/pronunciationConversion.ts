import {
  convertAzureIpaToUps,
  convertDictionaryToAzureIpa,
  convertDictionaryToUnified,
  EMPTY_SYNTHESIS,
  pronunciationLocale
} from "@tsz/shared";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import {
  candidateForSide,
  updateSynthesisCandidate
} from "./synthesisCandidates";

export type ConversionField = "actual_pron" | `${"uk" | "us"}.${"ipa" | "ups"}`;
export type PronunciationConversionPatch = Pick<
  WordPronunciationV3,
  "actual_pron" | "actual_pron_rich" | "synthesis"
>;
export interface PronunciationConversionPlan {
  patch: PronunciationConversionPatch;
  undo: PronunciationConversionPatch;
  rows: { field: ConversionField; before: string; after: string }[];
  requiresConfirmation: boolean;
}

/** Calculate every target first. Callers apply a successful plan with one draft update. */
export function planPronunciationConversion(
  pronunciation: WordPronunciationV3,
  spelling: string,
  dialect: Dialect
):
  | { ok: true; plan: PronunciationConversionPlan }
  | { ok: false; field: ConversionField; message: string } {
  const actual = convertDictionaryToUnified(
    pronunciation.dict_phonetic,
    spelling,
    dialect,
    pronunciation.style
  );
  if (!actual.ok) return { ...actual, field: "actual_pron" };
  let synthesis = pronunciation.synthesis ?? EMPTY_SYNTHESIS;
  const rows: PronunciationConversionPlan["rows"] = [
    {
      field: "actual_pron",
      before: pronunciation.actual_pron,
      after: actual.value
    }
  ];
  const sides = dialect === "common" ? (["uk", "us"] as const) : [dialect];
  for (const side of sides) {
    const locale = pronunciationLocale(side, "uk");
    const ipa = convertDictionaryToAzureIpa(
      pronunciation.dict_phonetic,
      spelling,
      locale,
      pronunciation.style
    );
    if (!ipa.ok) return { ...ipa, field: `${side}.ipa` };
    const ups = convertAzureIpaToUps(ipa.value, spelling, locale);
    if (!ups.ok) return { ...ups, field: `${side}.ups` };
    const previous = candidateForSide(synthesis, side, dialect);
    rows.push(
      { field: `${side}.ipa`, before: previous.ipa, after: ipa.value },
      { field: `${side}.ups`, before: previous.ups, after: ups.value }
    );
    synthesis = updateSynthesisCandidate(synthesis, side, dialect, {
      ...previous,
      ipa: ipa.value,
      ups: ups.value,
      ups_words: ups.ups_words
    });
  }
  const rich = pronunciation.actual_pron_rich;
  const hasAnnotations = Boolean(
    rich && (!("annotations" in rich) || rich.annotations.length > 0)
  );
  return {
    ok: true,
    plan: {
      patch: {
        actual_pron: actual.value,
        actual_pron_rich: { version: 2, text: actual.value, annotations: [] },
        synthesis
      },
      undo: {
        actual_pron: pronunciation.actual_pron,
        actual_pron_rich: pronunciation.actual_pron_rich,
        synthesis: pronunciation.synthesis
      },
      rows,
      requiresConfirmation:
        hasAnnotations ||
        rows.some((row) => row.before.trim() && row.before !== row.after)
    }
  };
}

export function pronunciationConversionRevision(
  pronunciation: WordPronunciationV3,
  spelling: string,
  dialect: Dialect
) {
  const synthesis = pronunciation.synthesis;
  // Generated audio and voice resolution can arrive without a text edit.
  const candidate = (side: "uk" | "us") => {
    const value = synthesis?.[side];
    return [
      value?.source,
      value?.ipa ?? "",
      value?.ups ?? "",
      value?.ups_words
    ];
  };
  return JSON.stringify([
    pronunciation.id,
    pronunciation.style,
    pronunciation.dict_phonetic,
    pronunciation.actual_pron,
    pronunciation.actual_pron_rich,
    spelling,
    dialect,
    synthesis?.alphabet,
    synthesis?.use_spelling,
    synthesis?.ipa,
    synthesis?.ups,
    synthesis?.ups_words,
    synthesis?.ipa_locale,
    synthesis?.ups_locale,
    candidate("uk"),
    candidate("us")
  ]);
}

/** Restore only conversion fields against current settings; never restore old asset IDs. */
export function undoPronunciationConversion(
  pronunciation: WordPronunciationV3,
  plan: PronunciationConversionPlan,
  dialect: Dialect
): PronunciationConversionPatch {
  let synthesis = pronunciation.synthesis;
  if (synthesis) {
    const sides = dialect === "common" ? (["uk", "us"] as const) : [dialect];
    for (const side of sides) {
      const previous = candidateForSide(
        plan.undo.synthesis ?? EMPTY_SYNTHESIS,
        side,
        dialect
      );
      synthesis = updateSynthesisCandidate(synthesis, side, dialect, {
        ...candidateForSide(synthesis, side, dialect),
        ipa: previous.ipa,
        ups: previous.ups,
        ups_words: previous.ups_words
      });
      const restored = synthesis[side]!;
      if (
        !plan.undo.synthesis?.[side] &&
        !restored.ipa_speech &&
        !restored.ups_speech
      )
        delete synthesis[side];
    }
    if (!plan.undo.synthesis && !synthesis.uk && !synthesis.us)
      synthesis = undefined;
  }
  return { ...plan.undo, synthesis };
}
