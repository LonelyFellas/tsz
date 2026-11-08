import { useVoiceTranslation } from "./i18n";
import type { AdminSpeechVoice } from "@tsz/types";
import { Alert, Typography } from "@tsz/ui/admin/display";
import { VoiceEditor } from "@tsz/voice-editor/editor";
import { V3GrammarFormPicker } from "@/features/dictionary/word-creation-v3/components/V3GrammarFormPicker";
import { voiceTrialCapabilities, type VoiceTrialSource } from "./voice-trial";

export function VoiceTrialEditor({
  voice,
  source,
  canReadWords,
  readOnly,
  onChange,
  onValidationChange
}: {
  voice: AdminSpeechVoice;
  source: VoiceTrialSource;
  canReadWords: boolean;
  readOnly: boolean;
  onChange: (source: VoiceTrialSource) => void;
  onValidationChange: (ready: boolean) => void;
}) {
  const { t } = useVoiceTranslation();
  const capabilities = voiceTrialCapabilities(voice);
  const english = voice.locale === "en-GB" || voice.locale === "en-US";
  const noReading =
    !capabilities.supportsPause &&
    !capabilities.supportsSayAs &&
    !capabilities.supportsSub &&
    !capabilities.supportsPhoneme;
  const length = Array.from(source.content.text).length;
  return (
    <div className="voice-trial-editor">
      {(noReading || !english) && (
        <Alert
          type="info"
          showIcon
          title={
            noReading
              ? voice.synthesis_available === false
                ? t("synthesis_is_not_enabled_yet")
                : t("pronunciation_annotations_are_unavailable")
              : t(
                  "phonemes_and_linked_readings_are_only_available_for_british_and_a"
                )
          }
        />
      )}
      <VoiceEditor
        contextKey={`voice-trial:${voice.alias}`}
        value={source.content}
        readingLinks={source.reading_links}
        mode="voice-trial"
        language={voice.locale.split("-")[0]}
        contextLabel={t("current_preview_text")}
        placeholder={t("enter_preview_text")}
        speechCapabilities={capabilities}
        previewEnabled={false}
        readOnly={readOnly}
        onValidationChange={onValidationChange}
        renderReadingPicker={
          canReadWords
            ? (props) => (
                <V3GrammarFormPicker
                  {...props}
                  locale={
                    english ? (voice.locale as "en-GB" | "en-US") : undefined
                  }
                />
              )
            : undefined
        }
        onChange={(content, _, readingLinks) =>
          onChange({ ...source, content, reading_links: readingLinks ?? [] })
        }
      />
      <Typography.Text
        type={length > 500 ? "danger" : "secondary"}
        className="voice-trial-counter"
      >
        {length} / 500
      </Typography.Text>
      {length > 500 && (
        <Alert type="error" showIcon title={t("at_most_500_characters")} />
      )}
    </div>
  );
}
