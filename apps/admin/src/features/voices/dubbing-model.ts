import { speechAccentGroup } from "@tsz/shared";
import type {
  AdminDubbingRecommendation,
  AdminDubbingGroupV3,
  AdminDubbingRecommendationPair,
  AdminSpeechVoice,
  AdminDubbingPairVoice
} from "@tsz/types";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";

export const dubbingGroupsKey = (accountId: string | undefined) =>
  ["admin-dubbing-groups-v3", accountId] as const;
export type DubbingDraft = AdminDubbingGroupV3 & {
  legacyPairs?: AdminDubbingRecommendationPair[];
};
export const sides = ["uk", "us"] as const;
export type DubbingSide = (typeof sides)[number];
export const sideName = (side: DubbingSide) =>
  side === "uk" ? "英式" : "美式";

export function newPairVoice(voice: AdminSpeechVoice): AdminDubbingPairVoice {
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

export function legacyComplete(group: DubbingDraft): boolean {
  const rec = group.recommendations;
  return (
    rec.format === "paired" ||
    sides.every((side) =>
      rec[side].every((item) =>
        group.legacyPairs?.some((pair) => pair[side].id === item.id)
      )
    )
  );
}

export function recommendationError(
  groupName: string,
  locale: "uk" | "us",
  item: AdminDubbingRecommendation,
  voice: AdminSpeechVoice | undefined
): string | null {
  const accent = locale === "uk" ? "英式" : "美式";
  const location = `${groupName || "未命名分组"} / ${accent} / ${item.name || "未命名推荐"}`;
  if (!voice || voice.synthesis_available === false)
    return `${location}：音色已不可用，请重新选择${accent}音色。`;
  if (speechAccentGroup(voice.locale, voice.accent) !== locale) {
    return `${location}：音色口音与${accent}推荐不符，请重新选择${accent}音色。`;
  }
  if (!item.name.trim()) return `${location}：请填写推荐名称。`;
  const caps = voice.capabilities;
  const {
    rate_percent,
    pitch_semitones,
    volume_percent = 100,
    style
  } = item.parameters;
  if (caps.supports_volume_percent === false && volume_percent !== 100)
    return `${location}：该模型仅支持原音量，请明确恢复原音量。`;
  if (
    !Number.isInteger(volume_percent) ||
    volume_percent < 0 ||
    volume_percent > 100
  ) {
    return `${location}：音量需为 0 到 100 之间的整数，请调整音量。`;
  }
  if (
    !Number.isInteger(rate_percent) ||
    rate_percent < caps.min_rate_percent ||
    rate_percent > caps.max_rate_percent
  ) {
    return `${location}：语速需在 ${((caps.min_rate_percent + 100) / 100).toFixed(2)}×–${((caps.max_rate_percent + 100) / 100).toFixed(2)}× 之间，最多两位小数，请调整语速。`;
  }
  if (
    !Number.isInteger(pitch_semitones) ||
    pitch_semitones < caps.min_pitch_semitones ||
    pitch_semitones > caps.max_pitch_semitones
  ) {
    return `${location}：音调需为 ${caps.min_pitch_semitones} 到 ${caps.max_pitch_semitones} 之间的整数半音，请调整音调。`;
  }
  if (style != null && !caps.styles.includes(style)) {
    return `${location}：当前风格不支持，请选择“默认”或该音色支持的风格。`;
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
    return `${location}：当前风格强度不适用，请恢复默认或选择支持的风格。`;
  if (
    item.parameters.role &&
    !voice.capability_evidence?.roles?.includes(item.parameters.role)
  )
    return `${location}：当前角色不支持，请恢复默认角色。`;
  return null;
}
