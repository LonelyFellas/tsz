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
import {
  newVoiceVersionId,
  voiceSettingKey,
  voiceSettingAccent
} from "./voice-versions";

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
    enabled: true,
    ...(speechAccentGroup(
      voices.find((voice) => voice.id === item.setting.voice_id)?.locale
    ) !== speechAccentGroup(item.locale)
      ? { accent: item.locale === "en-GB" ? ("gb" as const) : ("us" as const) }
      : {})
  };
}

export function voiceEffectKey(setting: VoiceSetting): string {
  return JSON.stringify([
    setting.voice_id,
    setting.locale,
    setting.accent,
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

export function inheritedDubbing(
  area: VoiceRecommendationArea
): NonNullable<VoiceProfile["dubbing"]> {
  return { area, uk: { mode: "inherit" }, us: { mode: "inherit" } };
}

export function profileHasInheritance(
  profile: VoiceProfile | null | undefined,
  locale?: AudioAssetLocale
): boolean {
  return (["uk", "us"] as const).some(
    (side) =>
      (!locale || speechAccentGroup(locale) === side) &&
      profile?.dubbing?.[side].mode === "inherit"
  );
}

export function localVoiceProfile(
  settings: readonly VoiceSetting[],
  options: readonly VoiceOption[],
  area?: VoiceRecommendationArea,
  previous?: VoiceProfile | null,
  side?: "uk" | "us"
): VoiceProfile {
  area ??= previous?.dubbing?.area;
  const dubbing = area
    ? {
        ...(previous?.dubbing ??
          (previous
            ? {
                area,
                uk: { mode: "local" as const },
                us: { mode: "local" as const }
              }
            : inheritedDubbing(area)))
      }
    : undefined;
  if (dubbing)
    for (const key of ["uk", "us"] as const) {
      if (!side || key === side)
        dubbing[key] = { ...dubbing[key], mode: "local" };
    }
  if (!area && !previous?.dubbing) return { voices: [...settings] };
  const sideOf = (setting: VoiceSetting) => {
    return voiceSettingAccent(setting, options);
  };
  const stored = side
    ? [
        ...settings.filter((item) => sideOf(item) === side),
        ...(previous?.voices ?? []).filter((item) => sideOf(item) !== side)
      ]
    : settings;
  return {
    voices: stored.map((setting) => {
      if (side && sideOf(setting) !== side) return { ...setting };
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
    ...(dubbing ? { dubbing } : {})
  };
}

export function resolveRecommendedVoices(
  profile: VoiceProfile | null | undefined,
  recommendations: readonly VoiceRecommendation[],
  voices: readonly VoiceOption[],
  locale?: AudioAssetLocale,
  content?: VoicePreviewRequest["content"],
  phonemeLocale?: AudioAssetLocale
): VoiceSetting[] {
  if (!profile?.dubbing) return profile?.voices ?? [];
  return (["en-GB", "en-US"] as const)
    .filter((accent) => !locale || accent === locale)
    .flatMap((accent) => {
      const selected =
        profile.dubbing?.[accent === "en-GB" ? "uk" : "us"].mode === "local"
          ? profile.voices.filter(
              (setting) =>
                setting.enabled &&
                voiceSettingAccent(setting, voices) ===
                  speechAccentGroup(accent)
            )
          : [];
      const local =
        profile.dubbing?.[accent === "en-GB" ? "uk" : "us"].mode === "local"
          ? selected.filter(
              (setting) =>
                setting.enabled &&
                isVoiceRecommendationAvailable(
                  {
                    id: setting.version_id ?? setting.voice_id,
                    name: setting.version_name ?? "",
                    locale: accent,
                    groupName: "",
                    setting: effectiveVoiceSetting(
                      setting,
                      voices.find((voice) => voice.id === setting.voice_id)
                    )
                  },
                  voices,
                  accent,
                  content,
                  phonemeLocale
                )
            )
          : [];
      if (profile.dubbing?.[accent === "en-GB" ? "uk" : "us"].mode === "local")
        return local;
      const recommended = recommendations.find(
        (item) =>
          item.selected !== false &&
          item.locale === accent &&
          isVoiceRecommendationAvailable(
            item,
            voices,
            accent,
            content,
            phonemeLocale
          )
      );
      if (recommended) return [recommendationVoiceSetting(recommended, voices)];
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
            content,
            phonemeLocale
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
