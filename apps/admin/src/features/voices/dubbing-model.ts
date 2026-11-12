import { defaultVoiceTranslation, type VoiceTranslation } from "./i18n";
import { speechAccentGroup } from "@tsz/shared";
import type {
  AdminDubbingRecommendation,
  AdminDubbingGroupV3,
  AdminSpeechVoice
} from "@tsz/types";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";

export const dubbingGroupsKey = (accountId: string | undefined) =>
  ["admin-dubbing-groups-v3", accountId] as const;
export type DubbingDraft = AdminDubbingGroupV3;
export const sides = ["uk", "us"] as const;
export type DubbingSide = (typeof sides)[number];
export const sideName = (
  side: DubbingSide,
  t: VoiceTranslation = defaultVoiceTranslation
) => t(side === "uk" ? "british" : "american");

export function newRecommendationVoice(
  voice: AdminSpeechVoice
): Omit<AdminDubbingRecommendation, "name" | "selected"> {
  const c = voice.capabilities;
  return {
    id: newWordNodeId(),
    voice_alias: voice.alias,
    parameters: {
      rate_percent: Math.max(
        c.min_rate_percent,
        Math.min(0, c.max_rate_percent)
      ),
      pitch_semitones: Math.max(
        c.min_pitch_semitones,
        Math.min(0, c.max_pitch_semitones)
      ),
      style: null
    }
  };
}

export function recommendationError(
  groupName: string,
  locale: "uk" | "us",
  item: AdminDubbingRecommendation,
  voice: AdminSpeechVoice | undefined,
  t: VoiceTranslation = defaultVoiceTranslation
): string | null {
  const accent = sideName(locale, t);
  const location = t("voice_location", {
    group: groupName || t("unnamed_group"),
    accent,
    name: item.name || t("unnamed_recommendation")
  });
  if (!voice || voice.synthesis_available === false)
    return t("recommendation_voice_unavailable", { location, accent });
  if (speechAccentGroup(voice.locale, voice.accent) !== locale) {
    return t("recommendation_accent_mismatch", { location, accent });
  }
  if (!item.name.trim()) return t("recommendation_name_required", { location });
  const caps = voice.capabilities;
  const {
    rate_percent,
    pitch_semitones,
    volume_percent = 100,
    style
  } = item.parameters;
  if (caps.supports_volume_percent === false && volume_percent !== 100)
    return t("recommendation_original_volume", { location });
  if (
    !Number.isInteger(volume_percent) ||
    volume_percent < 0 ||
    volume_percent > 100
  ) {
    return t("recommendation_volume_range", { location });
  }
  if (
    !Number.isInteger(rate_percent) ||
    rate_percent < caps.min_rate_percent ||
    rate_percent > caps.max_rate_percent
  ) {
    return t("recommendation_rate_range", {
      location,
      min: ((caps.min_rate_percent + 100) / 100).toFixed(2),
      max: ((caps.max_rate_percent + 100) / 100).toFixed(2)
    });
  }
  if (
    !Number.isInteger(pitch_semitones) ||
    pitch_semitones < caps.min_pitch_semitones ||
    pitch_semitones > caps.max_pitch_semitones
  ) {
    return t("recommendation_pitch_range", {
      location,
      min: caps.min_pitch_semitones,
      max: caps.max_pitch_semitones
    });
  }
  if (style != null && !caps.styles.includes(style)) {
    return t("recommendation_style_unsupported", { location });
  }
  if (
    item.parameters.style_degree != null &&
    (!Number.isFinite(item.parameters.style_degree) ||
      item.parameters.style_degree < 0.01 ||
      item.parameters.style_degree > 2 ||
      voice.capability_evidence?.supports_style_degree !== true ||
      !style ||
      style === "neutral")
  )
    return t("recommendation_style_degree_unsupported", { location });
  if (
    item.parameters.role &&
    !voice.capability_evidence?.roles?.includes(item.parameters.role)
  )
    return t("recommendation_role_unsupported", { location });
  return null;
}
