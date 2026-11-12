import { api } from "@/lib/auth";
import { speechAccentGroup, synthesisForLocale } from "@tsz/shared";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import type { GeneratedSpeechSource, VoiceProfileV3 } from "@tsz/types";
import {
  variantForCopyReference,
  type FormCopyPlan,
  type ResolvedFormCopyProfile
} from "./formCopyModel";

/** 将当前有效配音取成局部快照；不生成音频，也不沿用来源的音频引用。 */
export async function resolveFormCopyProfiles(
  plan: FormCopyPlan,
  signal: AbortSignal
): Promise<ResolvedFormCopyProfile[]> {
  if (plan.kind !== "voices") return [];
  const profiles = new Map<string, Promise<ResolvedFormCopyProfile>>();
  const hasProfiles = plan.matches.some((match) => {
    if (!match.source) return false;
    const variant = variantForCopyReference(
      plan.source.contentSnapshot,
      match.source
    );
    const row = variant.pronunciations.find(
      (item) => item.id === match.source!.pronunciationId
    )!;
    if (row.synthesis?.use_spelling)
      return variant.spelling_speech?.voice_profile;
    return (
      row.voice_profile ||
      row.synthesis?.uk?.ipa_speech ||
      row.synthesis?.uk?.ups_speech ||
      row.synthesis?.us?.ipa_speech ||
      row.synthesis?.us?.ups_speech
    );
  });
  if (!hasProfiles) return [];
  const catalogue = (await api.speech.voices(signal)).items;
  signal.throwIfAborted();
  for (const match of plan.matches) {
    if (!match.source) continue;
    const reference = match.source;
    const variant = variantForCopyReference(
      plan.source.contentSnapshot,
      match.source
    );
    const pronunciation = variant.pronunciations.find(
      (row) => row.id === reference.pronunciationId
    )!;
    const locale = match.side === "uk" ? "en-GB" : "en-US";
    const synthesis = pronunciation.synthesis
      ? synthesisForLocale(pronunciation.synthesis, locale, reference.region)
      : undefined;
    const add = (
      channel: ResolvedFormCopyProfile["channel"],
      profile: VoiceProfileV3 | undefined,
      source: GeneratedSpeechSource
    ) => {
      if (!profile) return;
      const key = `${match.side}:${pronunciation.id}:${channel}`;
      if (profiles.has(key)) return;
      profiles.set(
        key,
        (profile.dubbing
          ? api.speech.resolve(
              { profile, source, accent: match.side === "uk" ? "gb" : "us" },
              signal
            )
          : Promise.resolve({
              voices: profile.voices.filter((setting) => {
                const voice = catalogue.find(
                  (item) => item.alias === setting.voice_id
                );
                return (
                  speechAccentGroup(
                    voice?.locale ?? setting.locale,
                    voice?.accent
                  ) === match.side
                );
              })
            })
        ).then(({ voices }) => {
          const voiceKey = (setting: (typeof voices)[number]) =>
            setting.version_id ?? setting.voice_id;
          const resolved = new Map(
            voices.map((setting) => [voiceKey(setting), setting])
          );
          const stored = profile.voices.filter((setting) => {
            const voice = catalogue.find(
              (item) => item.alias === setting.voice_id
            );
            const side = speechAccentGroup(
              voice?.locale ?? setting.locale,
              voice?.accent
            );
            return (
              resolved.has(voiceKey(setting)) ||
              (side === match.side &&
                (profile.dubbing?.[match.side].mode !== "inherit" ||
                  !setting.enabled))
            );
          });
          const merged = stored.map((setting) => {
            const next = resolved.get(voiceKey(setting));
            resolved.delete(voiceKey(setting));
            return next ?? { ...setting, enabled: false };
          });
          return {
            side: match.side,
            sourcePronunciationId: pronunciation.id,
            channel,
            sideScoped: true,
            profile: {
              ...profile,
              voices: [...merged, ...resolved.values()]
            }
          };
        })
      );
    };
    const spellingSpeech = synthesis?.use_spelling
      ? variant.spelling_speech
      : undefined;
    add(
      "fallback",
      synthesis?.use_spelling
        ? spellingSpeech?.voice_profile
        : pronunciation.voice_profile,
      {
        kind: "text",
        content: synthesis?.use_spelling
          ? (spellingSpeech?.content ?? {
              version: 2,
              text: variant.spelling,
              annotations: []
            })
          : toRichTextV2(
              pronunciation.dict_phonetic_rich ?? {
                version: 2,
                text: pronunciation.dict_phonetic || variant.spelling,
                annotations: []
              }
            )
      }
    );
    if (synthesis?.use_spelling) continue;
    for (const alphabet of ["ipa", "ups"] as const) {
      const speech = synthesis?.[`${alphabet}_speech`];
      if (!speech) continue;
      add(alphabet, speech.voice_profile, {
        kind: "phoneme",
        phoneme_locale: locale,
        content: speech.content,
        alphabet,
        phoneme: synthesis![alphabet],
        ...(alphabet === "ups" ? { ups_words: synthesis!.ups_words ?? [] } : {})
      });
    }
  }
  return Promise.all(profiles.values());
}
