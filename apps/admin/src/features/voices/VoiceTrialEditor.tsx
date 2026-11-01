import type { AdminSpeechVoice } from "@tsz/types";
import { Alert, Typography } from "antd";
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
                ? "暂未开放合成"
                : "发音标注暂不可用"
              : "音标与关联读法仅限英美音色"
          }
        />
      )}
      <VoiceEditor
        value={source.content}
        readingLinks={source.reading_links}
        mode="voice-trial"
        language={voice.locale.split("-")[0]}
        contextLabel="本次试听文本"
        placeholder="输入试听文本"
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
      {length > 500 && <Alert type="error" showIcon title="最多 500 字符" />}
    </div>
  );
}
