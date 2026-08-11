import type { RichText } from "@tsz/types";
import type { VoiceSettings } from "../types";
import { toRichTextV2 } from "./normalize";

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function canonicalVoiceHash(
  value: RichText,
  settings: Partial<VoiceSettings> = {}
): string {
  const content = toRichTextV2(value);
  return fnv1a(
    JSON.stringify({
      content,
      voice_id: settings.voiceId ?? "",
      style: settings.style ?? "",
      rate_percent: settings.ratePercent ?? 0,
      pitch_semitones: settings.pitchSemitones ?? 0
    })
  );
}
