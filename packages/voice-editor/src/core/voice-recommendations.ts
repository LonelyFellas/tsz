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
      value.id === item.setting.voice_id && value.locale === item.locale
  );
  if (!voice || (locale && item.locale !== locale)) return false;
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
    (!style || voice.styles.includes(style)) &&
    (!voice.rateRange ||
      (rate >= voice.rateRange.min && rate <= voice.rateRange.max)) &&
    (!voice.pitchRange ||
      (pitch >= voice.pitchRange.min && pitch <= voice.pitchRange.max))
  );
}
