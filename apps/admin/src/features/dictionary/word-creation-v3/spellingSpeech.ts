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

/** 缺省配置与显式空配置等价，字段顺序和音色排列不改变含义。 */
export function spellingSpeechEqual(
  left?: SpellingSpeechV3,
  right?: SpellingSpeechV3
): boolean {
  const voices = (speech?: SpellingSpeechV3) =>
    JSON.stringify(
      (speech?.voice_profile.voices ?? [])
        .map((voice) => ({
          voice_id: voice.voice_id,
          enabled: voice.enabled,
          rate_percent: voice.rate_percent,
          pitch_semitones: voice.pitch_semitones ?? 0,
          style: voice.style ?? ""
        }))
        .sort((a, b) => a.voice_id.localeCompare(b.voice_id))
    );
  const empty: RichTextV2 = { version: 2, text: "", annotations: [] };
  return (
    spellingAnnotationsEqual(left?.content ?? empty, right?.content ?? empty) &&
    voices(left) === voices(right)
  );
}
