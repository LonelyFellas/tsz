import { speechAccentGroup } from "@tsz/shared";
import type {
  AudioAssetLocale,
  VoiceOption,
  VoiceRecommendation
} from "../types";

export function isVoiceRecommendationAvailable(
  item: VoiceRecommendation,
  voices: readonly VoiceOption[],
  locale?: AudioAssetLocale
): boolean {
  const voice = voices.find(
    (value) =>
      value.id === item.setting.voice_id &&
      (item.setting.locale
        ? value.locale === item.setting.locale
        : speechAccentGroup(value.locale, value.accent) ===
          speechAccentGroup(item.locale))
  );
  const group = item.setting.locale
    ? speechAccentGroup(voice?.locale, voice?.accent)
    : speechAccentGroup(item.locale);
  if (
    !voice ||
    (locale && group !== "other" && group !== speechAccentGroup(locale)) ||
    (group !== "other" &&
      speechAccentGroup(voice.locale, voice.accent) !== group) ||
    (item.setting.style_degree != null && voice.supportsStyleDegree !== true) ||
    (item.setting.role != null && !voice.roles?.includes(item.setting.role))
  )
    return false;
  const {
    rate_percent: rate,
    pitch_semitones: pitch = 0,
    volume_percent: volume = 100,
    style
  } = item.setting;
  return (
    Number.isInteger(volume) &&
    volume >= 0 &&
    volume <= 100 &&
    (voice.supportsVolume !== false || volume === 100) &&
    (!style || voice.styles.includes(style)) &&
    (!voice.rateRange ||
      (rate >= voice.rateRange.min && rate <= voice.rateRange.max)) &&
    (!voice.pitchRange ||
      (pitch >= voice.pitchRange.min && pitch <= voice.pitchRange.max))
  );
}
