import type {
  Dialect,
  PronunciationSynthesisCandidateV3,
  PronunciationSynthesisV3
} from "@tsz/types";
import { pronunciationLocale } from "@tsz/shared";

export function candidateForSide(
  synthesis: PronunciationSynthesisV3,
  side: "uk" | "us",
  dialect: Dialect
): PronunciationSynthesisCandidateV3 {
  if (synthesis[side]) return synthesis[side];
  const locale = pronunciationLocale(side, "uk");
  const ipaMatches = synthesis.ipa_locale
    ? synthesis.ipa_locale === locale
    : dialect === side;
  const upsMatches = synthesis.ups_locale
    ? synthesis.ups_locale === locale
    : dialect === side;
  return {
    ipa: ipaMatches ? synthesis.ipa : "",
    ups: upsMatches ? synthesis.ups : "",
    ...(upsMatches ? { ups_words: synthesis.ups_words } : {})
  };
}

/** Keep newly generated assets supplied by settings; invalidate references to old phonemes. */
export function updateSynthesisCandidate(
  synthesis: PronunciationSynthesisV3,
  side: "uk" | "us",
  dialect: Dialect,
  candidate: PronunciationSynthesisCandidateV3
): PronunciationSynthesisV3 {
  const previous = candidateForSide(synthesis, side, dialect);
  const updated = { ...candidate };
  for (const alphabet of ["ipa", "ups"] as const) {
    if (!candidate[alphabet].trim()) {
      delete updated[`${alphabet}_speech`];
      continue;
    }
    if (
      previous[alphabet] !== candidate[alphabet] ||
      (alphabet === "ups" &&
        JSON.stringify(previous.ups_words) !==
          JSON.stringify(candidate.ups_words))
    ) {
      const speech = candidate[`${alphabet}_speech`];
      const previousAssets = new Set(
        previous[`${alphabet}_speech`]?.voice_profile.voices.map(
          (setting) => setting.audio_asset_id
        )
      );
      if (speech)
        updated[`${alphabet}_speech`] = {
          ...speech,
          voice_profile: {
            ...speech.voice_profile,
            voices: speech.voice_profile.voices.map((setting) => {
              if (!previousAssets.has(setting.audio_asset_id)) return setting;
              const { audio_asset_id: _audio, ...rest } = setting;
              return rest;
            })
          }
        };
    }
  }
  return { ...synthesis, [side]: updated };
}
