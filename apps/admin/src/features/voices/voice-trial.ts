import { defaultVoiceTranslation, type VoiceTranslation } from "./i18n";
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
  source: VoiceTrialSource,
  t: VoiceTranslation = defaultVoiceTranslation
): string | undefined {
  if (
    !source.content.text.trim() ||
    Array.from(source.content.text).length > 500
  )
    return t("enter_1_500_characters_of_preview_text_4dc82c");
  const caps = voiceTrialCapabilities(voice);
  if (
    (source.reading_links.length ||
      source.content.annotations.some((mark) => mark.type === "phoneme")) &&
    !caps.supportsPhoneme
  )
    return t(
      "this_voice_does_not_support_specified_phonemes_or_linked_word_rea"
    );
  if (
    source.content.annotations.some(
      (mark) =>
        (mark.type === "pause" && !caps.supportsPause) ||
        (mark.type === "say_as" && !caps.supportsSayAs) ||
        (mark.type === "sub" && !caps.supportsSub)
    )
  )
    return t(
      "this_voice_does_not_support_these_readings_or_pauses_yet_remove_t"
    );
  const accent = voice.locale === "en-GB" ? "uk" : "us";
  if (source.reading_links.some((link) => !link.reading_reference?.[accent]))
    return t(
      "confirm_a_specific_reading_for_the_linked_word_in_the_current_acc"
    );
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
