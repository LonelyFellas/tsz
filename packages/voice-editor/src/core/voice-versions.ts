import { speechSelectionGroup } from "@tsz/shared";
import type {
  AudioAssetLocale,
  VoiceOption,
  VoiceProfile,
  VoiceSetting
} from "../types";

export function clearVoiceAudio(profile: VoiceProfile): VoiceProfile {
  return {
    voices: profile.voices.map(
      ({ audio_asset_id: _audio, ...setting }) => setting
    )
  };
}

export function voiceSettingKey(setting: VoiceSetting): string {
  return setting.version_id ?? setting.voice_id;
}

export function voiceSettingFor(
  settings: readonly VoiceSetting[],
  voiceId: string,
  editingKey?: string
): VoiceSetting | undefined {
  return (
    settings.find(
      (item) =>
        item.voice_id === voiceId && voiceSettingKey(item) === editingKey
    ) ??
    settings.find((item) => item.voice_id === voiceId && item.enabled) ??
    settings.find((item) => item.voice_id === voiceId)
  );
}

export function newVoiceVersionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function voiceLocale(
  setting: VoiceSetting,
  voices: readonly VoiceOption[]
): string | undefined {
  return (
    setting.locale ??
    voices.find((voice) => voice.id === setting.voice_id)?.locale
  );
}

export function selectVoiceVersion(
  settings: readonly VoiceSetting[],
  selected: VoiceSetting,
  locale: AudioAssetLocale,
  voices: readonly VoiceOption[]
): VoiceSetting[] {
  const key = voiceSettingKey(selected);
  const hasSelected = settings.some((item) => voiceSettingKey(item) === key);
  const next = settings.map((item) =>
    voiceSettingKey(item) === key
      ? { ...selected, enabled: true }
      : speechSelectionGroup(voiceLocale(item, voices)) ===
          speechSelectionGroup(locale)
        ? { ...item, enabled: false }
        : item
  );
  return hasSelected ? next : [...next, { ...selected, enabled: true }];
}
