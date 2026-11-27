import { api } from "@/lib/auth";
import { HttpError } from "@tsz/api-client";
import { speechAccentGroup } from "@tsz/shared";
import { normalizeSpeechLiaisons, toRichTextV2 } from "@tsz/voice-editor/core";
import type { GeneratedSpeechSource, VoiceProfileV3 } from "@tsz/types";
import {
  spellingCopyInput,
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
    if (selected.use_spelling)
      return spellingCopyInput(
        variant,
        row,
        match.side,
        selected.source === "spelling"
      ).profile;
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
      source: GeneratedSpeechSource,
      usesDefault = false
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
          ? api.speech
              .resolve(
                { profile, source, accent: match.side === "uk" ? "gb" : "us" },
                signal
              )
              .catch((error: unknown) => {
                // 隐式推荐可能只覆盖一侧，仍可复制另一侧有音色的配置。
                if (
                  usesDefault &&
                  error instanceof HttpError &&
                  error.status === 400 &&
                  error.code === "invalid_speech_preview"
                )
                  return { voices: [] };
                throw error;
              })
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
    const spelling = synthesis.use_spelling
      ? spellingCopyInput(
          variant,
          pronunciation,
          match.side,
          synthesis.source === "spelling"
        )
      : undefined;
    const spellingContent = spelling?.usesDefault
      ? normalizeSpeechLiaisons(spelling.content)
      : spelling?.content;
    add(
      "fallback",
      spelling ? spelling.profile : pronunciation.voice_profile,
      {
        kind: "text",
        content:
          spellingContent ??
          toRichTextV2(
            pronunciation.dict_phonetic_rich ?? {
              version: 2,
              text: pronunciation.dict_phonetic || variant.spelling,
              annotations: []
            }
          )
      },
      spelling?.usesDefault
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
