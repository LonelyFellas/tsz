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
  const undoSynthesis = pronunciation.synthesis
    ? { ...pronunciation.synthesis }
    : undefined;
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
    // Undo restores text and settings, without resurrecting invalidated audio references.
    if (undoSynthesis?.[side])
      undoSynthesis[side] = {
        ...undoSynthesis[side],
        ...(previous.ipa_speech
          ? { ipa_speech: synthesis[side]!.ipa_speech }
          : {}),
        ...(previous.ups_speech
          ? { ups_speech: synthesis[side]!.ups_speech }
          : {})
      };
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
        synthesis: undoSynthesis
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
  return JSON.stringify([pronunciation, spelling, dialect]);
}
