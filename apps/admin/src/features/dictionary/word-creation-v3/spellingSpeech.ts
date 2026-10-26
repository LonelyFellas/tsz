import { spellingAnnotationsEqual } from "@tsz/voice-editor/core";
import type { RichTextV2, RichTextV2V3, SpellingSpeechV3 } from "@tsz/types";

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
