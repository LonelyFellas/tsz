import type {
  AdminSpeechVoice,
  AdminVoiceParameters,
  GrammarFormLinkV3,
  RichTextV2
} from "@tsz/types";
import type { VoiceOption, VoiceSetting } from "@tsz/voice-editor/types";

export interface VoiceTrialSource {
  content: RichTextV2;
  reading_links: GrammarFormLinkV3[];
  output_format: "mp3" | "wav";
}

export function newVoiceTrial(text: string): VoiceTrialSource {
  return {
    content: { version: 2, text, annotations: [] },
    reading_links: [],
    output_format: "mp3"
  };
}

export function voiceTrialCapabilities(
  voice: AdminSpeechVoice
): Pick<
  VoiceOption,
  "supportsPhoneme" | "supportsPause" | "supportsSayAs" | "supportsSub"
> {
  const model = voice.capability_evidence?.model ?? voice.metadata?.model;
  const available = voice.synthesis_available !== false && model !== "hd_flash";
  const knownModel = !!model && model !== "hd_flash";
  return {
    supportsPhoneme:
      available &&
      ["en-GB", "en-US"].includes(voice.locale) &&
      (voice.capabilities.supports_phoneme ?? knownModel),
    supportsPause:
      available && (voice.capabilities.supports_pause ?? knownModel),
    supportsSayAs: available && knownModel,
    supportsSub: available && knownModel
  };
}

export function voiceTrialIssue(
  voice: AdminSpeechVoice,
  source: VoiceTrialSource
): string | undefined {
  if (
    !source.content.text.trim() ||
    Array.from(source.content.text).length > 500
  )
    return "请输入 1–500 个字符的试听文本。";
  const caps = voiceTrialCapabilities(voice);
  if (
    (source.reading_links.length ||
      source.content.annotations.some((mark) => mark.type === "phoneme")) &&
    !caps.supportsPhoneme
  )
    return "当前音色暂未开放指定音标或关联单词读法，请移除标注或使用支持的音色。";
  if (
    source.content.annotations.some(
      (mark) =>
        (mark.type === "pause" && !caps.supportsPause) ||
        (mark.type === "say_as" && !caps.supportsSayAs) ||
        (mark.type === "sub" && !caps.supportsSub)
    )
  )
    return "当前音色暂未开放这些读法或停顿，请移除标注或使用支持的音色。";
  const accent = voice.locale === "en-GB" ? "uk" : "us";
  if (source.reading_links.some((link) => !link.reading_reference?.[accent]))
    return "当前口音尚未确认关联词的具体读法，请重新选择。";
}

export function voiceTrialSetting(
  voice: AdminSpeechVoice,
  parameters: Pick<
    import("@tsz/types").AdminVoiceParameters,
    | "rate_percent"
    | "pitch_semitones"
    | "volume_percent"
    | "style"
    | "style_degree"
    | "role"
  >,
  outputFormat: "mp3" | "wav"
): VoiceSetting {
  const effective = effectiveVoiceParameters(voice, parameters);
  return {
    voice_id: voice.alias,
    version_id: "00000000-0000-4000-8000-000000000002",
    version_name: voice.display_name,
    ...(voice.locale.startsWith("en-")
      ? { locale: voice.locale as `en-${string}` }
      : {}),
    enabled: true,
    rate_percent: effective.rate_percent,
    pitch_semitones: effective.pitch_semitones,
    volume_percent: effective.volume_percent ?? 100,
    ...(effective.style ? { style: effective.style } : {}),
    ...(effective.style_degree != null
      ? { style_degree: effective.style_degree }
      : {}),
    ...(effective.role ? { role: effective.role } : {}),
    output_format: outputFormat
  };
}

export function effectiveVoiceParameters(
  target: AdminSpeechVoice,
  raw: AdminVoiceParameters
) {
  const caps = target.capabilities,
    evidence = target.capability_evidence;
  const style = raw.style && caps.styles.includes(raw.style) ? raw.style : null;
  return {
    ...raw,
    rate_percent:
      caps.min_rate_percent === caps.max_rate_percent
        ? caps.min_rate_percent
        : raw.rate_percent,
    pitch_semitones:
      caps.min_pitch_semitones === caps.max_pitch_semitones
        ? caps.min_pitch_semitones
        : raw.pitch_semitones,
    volume_percent:
      caps.supports_volume_percent === false ? 100 : raw.volume_percent,
    style,
    style_degree:
      evidence?.supports_style_degree && style ? raw.style_degree : undefined,
    role:
      evidence?.roles?.includes(raw.role ?? "") && style ? raw.role : undefined
  };
}
