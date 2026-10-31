import type {
  AudioAssetLocale,
  VoiceOption,
  VoiceProfile,
  VoicePreviewRequest,
  VoiceRecommendation,
  VoiceRecommendationArea,
  VoiceSetting
} from "../types";
import { speechAccentGroup } from "@tsz/shared";
import { isVoiceRecommendationAvailable } from "./voice-recommendations";
import { effectiveVoiceSetting } from "./voice-pool";
import { newVoiceVersionId, voiceSettingKey } from "./voice-versions";

export function recommendationVoiceSetting(
  item: VoiceRecommendation,
  voices: readonly VoiceOption[]
): VoiceSetting {
  return {
    ...item.setting,
    version_id: item.id,
    version_name: item.name,
    locale: (voices.find((voice) => voice.id === item.setting.voice_id)
      ?.locale ?? item.locale) as AudioAssetLocale,
    enabled: true
  };
}

export function voiceEffectKey(setting: VoiceSetting): string {
  return JSON.stringify([
    setting.voice_id,
    setting.locale,
    setting.rate_percent,
    setting.pitch_semitones ?? 0,
    setting.volume_percent ?? 100,
    setting.style ?? null,
    setting.style_degree ?? null,
    setting.role ?? null,
    setting.output_format ?? "mp3"
  ]);
}

export function retainResolvedAudio(
  resolved: readonly VoiceSetting[],
  stored: readonly VoiceSetting[]
): VoiceSetting[] {
  return resolved.map((setting) => {
    const previous = stored.find(
      (item) =>
        voiceSettingKey(item) === voiceSettingKey(setting) &&
        voiceEffectKey(item) === voiceEffectKey(setting)
    );
    return previous?.audio_asset_id
      ? { ...setting, audio_asset_id: previous.audio_asset_id }
      : setting;
  });
}

export function localVoiceProfile(
  voices: readonly VoiceSetting[],
  options: readonly VoiceOption[],
  area?: VoiceRecommendationArea,
  previous?: VoiceProfile | null
): VoiceProfile {
  if (!area && !previous?.dubbing) return { voices: [...voices] };
  area ??= previous?.dubbing?.area;
  return {
    voices: voices.map((setting) => {
      const voice = options.find((voice) => voice.id === setting.voice_id);
      return setting.version_id || !voice
        ? { ...setting }
        : {
            ...setting,
            version_id: newVoiceVersionId(),
            version_name: voice.label,
            locale: voice.locale as AudioAssetLocale
          };
    }),
    ...(area
      ? {
          dubbing: {
            mode: "local" as const,
            area,
            recommendation_order: previous?.dubbing?.recommendation_order ?? [],
            ...(previous?.dubbing?.pool_version
              ? {
                  pool_version: previous.dubbing.pool_version,
                  ...(previous.dubbing.recommendation
                    ? { recommendation: previous.dubbing.recommendation }
                    : {})
                }
              : {})
          }
        }
      : {})
  };
}

export function resolveRecommendedVoices(
  profile: VoiceProfile | null | undefined,
  recommendations: readonly VoiceRecommendation[],
  voices: readonly VoiceOption[],
  locale?: AudioAssetLocale,
  content?: VoicePreviewRequest["content"]
): VoiceSetting[] {
  if (!profile?.dubbing) return profile?.voices ?? [];
  return (["en-GB", "en-US"] as const)
    .filter((accent) => !locale || accent === locale)
    .flatMap((accent) => {
      const selected =
        profile.dubbing?.mode === "local"
          ? profile.voices.filter(
              (setting) =>
                setting.enabled &&
                speechAccentGroup(
                  voices.find((voice) => voice.id === setting.voice_id)
                    ?.locale ?? setting.locale,
                  voices.find((voice) => voice.id === setting.voice_id)?.accent
                ) === speechAccentGroup(accent)
            )
          : [];
      const local =
        profile.dubbing?.mode === "local"
          ? selected.filter(
              (setting) =>
                setting.enabled &&
                isVoiceRecommendationAvailable(
                  {
                    id: setting.version_id ?? setting.voice_id,
                    name: setting.version_name ?? "",
                    locale: accent,
                    groupName: "",
                    setting: profile.dubbing?.pool_version
                      ? effectiveVoiceSetting(
                          setting,
                          voices.find((voice) => voice.id === setting.voice_id)
                        )
                      : setting
                  },
                  voices,
                  accent,
                  content
                )
            )
          : [];
      if (profile.dubbing?.pool_version && profile.dubbing.mode === "local")
        return local;
      if (selected.length) return local.length === selected.length ? local : [];
      const recommended = recommendations.find(
        (item) =>
          item.selected !== false &&
          item.locale === accent &&
          isVoiceRecommendationAvailable(item, voices, accent, content)
      );
      if (recommended) return [recommendationVoiceSetting(recommended, voices)];
      // Existing local-empty profiles retain their old fallback until pool conversion.
      if (profile.dubbing?.mode === "inherit") return [];
      const fallback = voices.find(
        (voice) =>
          speechAccentGroup(voice.locale, voice.accent) ===
            speechAccentGroup(accent) &&
          isVoiceRecommendationAvailable(
            {
              id: voice.id,
              name: voice.label,
              locale: accent,
              groupName: "",
              setting: { voice_id: voice.id, enabled: true, rate_percent: 0 }
            },
            voices,
            accent,
            content
          )
      );
      return fallback
        ? [
            {
              voice_id: fallback.id,
              enabled: true,
              rate_percent: 0,
              version_id: newVoiceVersionId(),
              version_name: fallback.label,
              locale: fallback.locale as AudioAssetLocale
            }
          ]
        : [];
    });
}
