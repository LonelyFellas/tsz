import { speechAccentGroup } from "@tsz/shared";
import type {
  AudioAssetLocale,
  VoicePreviewRequest,
  VoiceOption,
  VoiceRecommendation
} from "../types";

export function isVoiceRecommendationAvailable(
  item: VoiceRecommendation,
  voices: readonly VoiceOption[],
  locale?: AudioAssetLocale,
  content?: VoicePreviewRequest["content"]
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
    (item.setting.style_degree != null &&
      (voice.supportsStyleDegree !== true ||
        !item.setting.style ||
        !Number.isFinite(item.setting.style_degree) ||
        item.setting.style_degree < 0.01 ||
        item.setting.style_degree > 2 ||
        Math.abs(
          Math.round(item.setting.style_degree * 100) -
            item.setting.style_degree * 100
        ) > 0.000001)) ||
    (item.setting.role != null &&
      (!item.setting.style || !voice.roles?.includes(item.setting.role))) ||
    content?.annotations.some(
      (mark) =>
        (mark.type === "pause" && voice.supportsPause === false) ||
        (mark.type === "say_as" && voice.supportsSayAs === false) ||
        (mark.type === "sub" && voice.supportsSub === false) ||
        (mark.type === "phoneme" &&
          (voice.supportsPhoneme === false ||
            voice.locale !== (locale ?? item.locale)))
    )
  )
    return false;
  const {
    rate_percent: rate,
    pitch_semitones: pitch = 0,
    volume_percent: volume = 100,
    style
  } = item.setting;
  return (
    Number.isInteger(rate) &&
    Number.isInteger(pitch) &&
    (voice.supportsRate !== false || rate === 0) &&
    (voice.supportsPitch !== false || pitch === 0) &&
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
