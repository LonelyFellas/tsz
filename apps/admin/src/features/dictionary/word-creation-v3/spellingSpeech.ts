import {
  clearVoiceAudio,
  spellingAnnotationsEqual,
  voiceSettingKey,
  voiceEffectKey,
  toRichTextV2,
  withDefaultVoiceProfile
} from "@tsz/voice-editor/core";
import { speechAccentGroup } from "@tsz/shared";
import type {
  VoiceAssociation,
  VoiceEditResult
} from "@tsz/voice-editor/types";
import type {
  Dialect,
  PhonemeLocaleV3,
  WordPronunciationV3,
  RichTextV2,
  RichTextV2V3,
  SpellingSpeechV3,
  VoiceProfileV3
} from "@tsz/types";

/** 显式来源按共享所有者聚合；旧协议仍要求独立拼写音频，保持发布兼容。 */
export function spellingAudioLocales(
  variants: readonly {
    dialect: Dialect;
    pronunciations: readonly WordPronunciationV3[];
  }[]
): PhonemeLocaleV3[] {
  return (["en-GB", "en-US"] as const).filter((locale) => {
    const side = locale === "en-GB" ? "uk" : "us";
    return variants.some((variant) => {
      if (variant.dialect !== "common" && variant.dialect !== side)
        return false;
      const explicitSources = variant.pronunciations.some(
        (row) => row.synthesis?.uk?.source || row.synthesis?.us?.source
      );
      return (
        !explicitSources ||
        variant.pronunciations.some(
          (row) =>
            (row.synthesis?.[side]?.source ??
              (row.synthesis?.use_spelling ? "spelling" : "ipa")) === "spelling"
        )
      );
    });
  });
}

/** 设置只替换当前口音；停顿共享，变更后另一口音的旧音频引用必须失效。 */
export function mergeSpellingSettings<T extends VoiceAssociation>(
  latest: {
    value: RichTextV2;
    voiceProfile?: VoiceProfileV3 | null;
    audioAssets?: SpellingSpeechV3["audio_assets"] | null;
  },
  initial: {
    value: RichTextV2;
    voiceProfile?: VoiceProfileV3 | null;
    audioAssets?: SpellingSpeechV3["audio_assets"] | null;
  },
  result: VoiceEditResult<T>,
  side: "uk" | "us"
): VoiceEditResult<T> & { value: RichTextV2 } {
  const speechMarks = (value: RichTextV2) =>
    value.annotations.filter((mark) =>
      ["pause", "say_as", "sub"].includes(mark.type)
    );
  const changedContent =
    JSON.stringify(speechMarks(initial.value)) !==
    JSON.stringify(speechMarks(toRichTextV2(result.value)));
  const value = changedContent
    ? {
        ...latest.value,
        annotations: [
          ...latest.value.annotations.filter(
            (mark) => !["pause", "say_as", "sub"].includes(mark.type)
          ),
          ...speechMarks(toRichTextV2(result.value))
        ]
      }
    : latest.value;
  const original = withDefaultVoiceProfile(initial.voiceProfile, "word");
  const edited = result.voiceProfile;
  const profileChanged = JSON.stringify(original) !== JSON.stringify(edited);
  let voiceProfile = latest.voiceProfile ?? undefined;
  if (profileChanged && edited) {
    const originalKeys = new Set(original.voices.map(voiceSettingKey));
    const editedKeys = new Set(edited.voices.map(voiceSettingKey));
    const selected = edited.voices
      .filter((voice) => speechAccentGroup(voice.locale, voice.accent) === side)
      .map((voice) => {
        const previous = original.voices.find(
          (item) => voiceSettingKey(item) === voiceSettingKey(voice)
        );
        if (
          previous &&
          voiceEffectKey(previous) !== voiceEffectKey(voice) &&
          previous.audio_asset_id === voice.audio_asset_id
        ) {
          const { audio_asset_id: _audio, ...updated } = voice;
          return updated;
        }
        return voice;
      });
    const selectedKeys = new Set(selected.map(voiceSettingKey));
    voiceProfile = {
      ...latest.voiceProfile,
      ...(edited.dubbing
        ? {
            dubbing: {
              ...(withDefaultVoiceProfile(latest.voiceProfile, "word")
                .dubbing ?? {
                area: "word" as const,
                uk: { mode: "local" as const },
                us: { mode: "local" as const }
              }),
              [side]: edited.dubbing[side]
            }
          }
        : {}),
      voices: [
        ...(latest.voiceProfile?.voices ?? []).filter(
          (voice) =>
            speechAccentGroup(voice.locale, voice.accent) !== side &&
            !selectedKeys.has(voiceSettingKey(voice)) &&
            !(
              speechAccentGroup(voice.locale, voice.accent) === "other" &&
              originalKeys.has(voiceSettingKey(voice)) &&
              !editedKeys.has(voiceSettingKey(voice))
            )
        ),
        ...selected
      ]
    };
  }
  if (changedContent && voiceProfile) {
    voiceProfile = clearVoiceAudio(voiceProfile);
  }
  return {
    ...result,
    value,
    voiceProfile,
    audioAssets:
      JSON.stringify(initial.audioAssets ?? []) ===
      JSON.stringify(result.audioAssets ?? [])
        ? (latest.audioAssets ?? undefined)
        : [
            ...(latest.audioAssets ?? []).filter(
              (asset) => speechAccentGroup(asset.locale) !== side
            ),
            ...(result.audioAssets ?? []).filter(
              (asset) => speechAccentGroup(asset.locale) === side
            )
          ]
  };
}

/** 编辑器合并显示标注与独立试听停顿，wire 仍分别保存。 */
export function spellingEditorValue(variant: {
  spelling: string;
  spelling_rich?: RichTextV2V3;
  spelling_speech?: SpellingSpeechV3;
}): RichTextV2 {
  return {
    version: 2,
    text: variant.spelling,
    annotations: [
      ...(variant.spelling_rich?.annotations ?? []),
      ...(variant.spelling_speech?.content.annotations ?? [])
    ]
  };
}

/** 缺省与显式空配置等价；显式配音模式的版本顺序决定默认播放。 */
export function spellingSpeechEqual(
  left?: SpellingSpeechV3,
  right?: SpellingSpeechV3
): boolean {
  const voices = (speech?: SpellingSpeechV3) => {
    const values = (speech?.voice_profile.voices ?? []).map((voice) => ({
      voice_id: voice.voice_id,
      version_id: voice.version_id,
      audio_asset_id: voice.audio_asset_id,
      version_name: voice.version_name,
      locale: voice.locale,
      accent: voice.accent,
      enabled: voice.enabled,
      rate_percent: voice.rate_percent,
      pitch_semitones: voice.pitch_semitones ?? 0,
      volume_percent: voice.volume_percent ?? 100,
      style: voice.style ?? "",
      style_degree: voice.style_degree,
      role: voice.role,
      output_format: voice.output_format ?? "mp3"
    }));
    if (!speech?.voice_profile.dubbing)
      values.sort(
        (a, b) =>
          a.voice_id.localeCompare(b.voice_id) ||
          (a.version_id ?? "").localeCompare(b.version_id ?? "")
      );
    return JSON.stringify(values);
  };
  const empty: RichTextV2 = { version: 2, text: "", annotations: [] };
  return (
    spellingAnnotationsEqual(left?.content ?? empty, right?.content ?? empty) &&
    voices(left) === voices(right) &&
    JSON.stringify(left?.audio_assets ?? []) ===
      JSON.stringify(right?.audio_assets ?? []) &&
    JSON.stringify(left?.voice_profile.dubbing) ===
      JSON.stringify(right?.voice_profile.dubbing)
  );
}
