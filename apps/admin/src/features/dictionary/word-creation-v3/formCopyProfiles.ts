import { api } from "@/lib/auth";
import { speechAccentGroup, spellingSpeechContent } from "@tsz/shared";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import type { GeneratedSpeechSource, VoiceProfileV3 } from "@tsz/types";
import {
  variantForCopyReference,
  voiceCopySynthesisForSide,
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
  const rowCopies = plan.matches.map(({ side, source }) => ({
    side,
    source,
    activeOnly: false
  }));
  const sharedSides = plan.sharedSpellings.flatMap(({ sides }) => sides);
  const copies = [
    ...rowCopies,
    ...sharedSides.flatMap(({ side, sources }) =>
      sources.map((source) => ({ side, source, activeOnly: true }))
    )
  ];
  const hasProfiles = copies.some((match) => {
    if (!match.source) return false;
    const variant = variantForCopyReference(
      plan.source.contentSnapshot,
      match.source
    );
    const row = variant.pronunciations.find(
      (item) => item.id === match.source!.pronunciationId
    )!;
    const selected = voiceCopySynthesisForSide(
      row,
      match.side,
      match.source.region
    );
    if (selected.source === "none" || selected.source === "upload")
      return false;
    if (selected.use_spelling) return variant.spelling_speech?.voice_profile;
    return (
      row.voice_profile ||
      selected[`${selected.alphabet}_speech`] ||
      (!match.activeOnly && (selected.ipa_speech || selected.ups_speech))
    );
  });
  if (!hasProfiles) return [];
  const catalogue = new Map(
    (await api.speech.voices(signal)).items.map((item) => [item.alias, item])
  );
  signal.throwIfAborted();
  const resolveCopy = async (match: (typeof copies)[number]) => {
    if (!match.source) return [];
    const reference = match.source;
    const variant = variantForCopyReference(
      plan.source.contentSnapshot,
      match.source
    );
    const pronunciation = variant.pronunciations.find(
      (row) => row.id === reference.pronunciationId
    )!;
    const locale = match.side === "uk" ? "en-GB" : "en-US";
    const synthesis = voiceCopySynthesisForSide(
      pronunciation,
      match.side,
      reference.region
    );
    if (synthesis.source === "none" || synthesis.source === "upload") return [];
    const pending: Promise<ResolvedFormCopyProfile>[] = [];
    const add = (
      channel: ResolvedFormCopyProfile["channel"],
      profile: VoiceProfileV3 | undefined,
      source: GeneratedSpeechSource
    ) => {
      if (!profile) return;
      const key = `${match.side}:${pronunciation.id}:${channel}`;
      const cached = profiles.get(key);
      if (cached) {
        pending.push(cached);
        return;
      }
      const request = (
        profile.dubbing
          ? api.speech.resolve(
              { profile, source, accent: match.side === "uk" ? "gb" : "us" },
              signal
            )
          : Promise.resolve({
              voices: profile.voices.filter((setting) => {
                const voice = catalogue.get(setting.voice_id);
                return (
                  speechAccentGroup(
                    voice?.locale ?? setting.locale,
                    voice?.accent ?? setting.accent
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
          const voice = catalogue.get(setting.voice_id);
          const side = speechAccentGroup(
            voice?.locale ?? setting.locale,
            voice?.accent ?? setting.accent
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
          catalogue,
          profile: {
            ...profile,
            voices: [...merged, ...resolved.values()]
          }
        };
      });
      profiles.set(key, request);
      pending.push(request);
    };
    const spellingSpeech = synthesis.use_spelling
      ? variant.spelling_speech
      : undefined;
    add(
      "fallback",
      synthesis.use_spelling
        ? spellingSpeech?.voice_profile
        : pronunciation.voice_profile,
      {
        kind: "text",
        content: synthesis.use_spelling
          ? (spellingSpeechContent(spellingSpeech, match.side) ?? {
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
    if (!synthesis.use_spelling) {
      for (const alphabet of ["ipa", "ups"] as const) {
        if (match.activeOnly && alphabet !== synthesis.alphabet) continue;
        const speech = synthesis[`${alphabet}_speech`];
        if (!speech) continue;
        add(alphabet, speech.voice_profile, {
          kind: "phoneme",
          phoneme_locale: locale,
          content: speech.content,
          alphabet,
          phoneme: synthesis[alphabet],
          ...(alphabet === "ups"
            ? { ups_words: synthesis.ups_words ?? [] }
            : {})
        });
      }
    }
    return Promise.all(pending);
  };
  await Promise.all([
    ...rowCopies.map(resolveCopy),
    ...sharedSides.map(async ({ side, sources, preferredSources }) => {
      const resolveShared = (source: (typeof sources)[number]) =>
        resolveCopy({ side, source, activeOnly: true });
      const preferred = await Promise.all(preferredSources.map(resolveShared));
      if (
        preferred.some((items) =>
          items.some((item) => item.profile.voices.length)
        )
      )
        return;
      await Promise.all(sources.map(resolveShared));
    })
  ]);
  return Promise.all(profiles.values());
}
