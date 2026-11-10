import {
  useVoiceTranslation,
  voiceMessageText,
  voiceLabel,
  type VoiceMessageValue
} from "./i18n";
import { Volume2Icon } from "lucide-react";
import {
  Alert,
  Button,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { useLayoutEffect, useState, type RefObject } from "react";
import type {
  AdminSpeechPreviewResponse,
  AdminSpeechVoice,
  AdminVoiceParameters
} from "@tsz/types";
import { AudioReview, type ReviewAudio } from "@tsz/voice-editor/editor";
import { api } from "@/lib/auth";
import { VoiceName, VoiceRate, VoiceVolume } from "./VoiceDisplay";
import { styleNames } from "./voice-labels";

export interface VoicePreviewData {
  result: AdminSpeechPreviewResponse;
  voice: AdminSpeechVoice;
  parameters: AdminVoiceParameters;
  comparison?: VoiceMessageValue;
}

export function VoicePreviewResult({
  preview,
  pending,
  error,
  onCancel,
  player,
  onPlay
}: {
  preview?: VoicePreviewData | null;
  pending: boolean;
  error?: string | null;
  onCancel: () => void;
  player: RefObject<HTMLAudioElement | null>;
  onPlay: () => void;
}) {
  const { t } = useVoiceTranslation();
  const [audioError, setAudioError] = useState(false);
  const [reviewAudio, setReviewAudio] = useState<ReviewAudio>();
  const [reviewReady, setReviewReady] = useState(false);
  // 在新音频触发加载事件前清理旧状态，避免覆盖当前的加载错误。
  useLayoutEffect(() => {
    setAudioError(false);
    setReviewAudio(undefined);
    setReviewReady(false);
  }, [preview?.result.audio_url]);
  const hasReview =
    !!reviewAudio &&
    reviewAudio.result.audioUrl === preview?.result.audio_url &&
    !audioError;
  return (
    <div className="voice-library-preview" aria-live="polite">
      {pending && (
        <Space>
          <Volume2Icon />
          <Typography.Text type="secondary">
            {t("generating_preview")}
          </Typography.Text>
          <Button type="link" size="small" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </Space>
      )}
      {error && <Alert type="error" showIcon title={error} />}
      {!pending && !error && !preview && (
        <div className="voice-library-preview-empty">
          <Volume2Icon />
          <Typography.Text type="secondary">
            {t("no_preview_audio_yet")}
          </Typography.Text>
        </div>
      )}
      {preview && (
        <div className="voice-library-player">
          <Flex vertical gap={8}>
            <div className="voice-library-player-heading">
              <Space wrap>
                <VoiceName voice={preview.voice} />
                <Tag>
                  {voiceMessageText(preview.comparison, t) ??
                    (preview.voice.locale === "en-GB"
                      ? t("british_english")
                      : preview.voice.locale === "en-US"
                        ? t("american_english")
                        : preview.voice.locale)}
                </Tag>
              </Space>
              <Typography.Text type="secondary">
                {t("volume")} <VoiceVolume parameters={preview.parameters} />
                {t("preview_parameter_separator")}
                <VoiceRate parameters={preview.parameters} />
                {t("preview_style_suffix", {
                  style: preview.parameters.style
                    ? voiceLabel(
                        styleNames[preview.parameters.style] ??
                          preview.parameters.style,
                        t
                      )
                    : t("default")
                })}
              </Typography.Text>
            </div>
            <audio
              key={`audio:${preview.result.audio_url}`}
              ref={player}
              controls={!hasReview || !reviewReady}
              hidden={hasReview && reviewReady}
              autoPlay
              aria-label={t("preview_player", {
                name: preview.voice.display_name
              })}
              src={preview.result.audio_url}
              onLoadedMetadata={(event) =>
                setReviewAudio({
                  audio: event.currentTarget,
                  name: preview.voice.display_name,
                  result: {
                    audioUrl: preview.result.audio_url,
                    expiresAt: preview.result.expires_at,
                    cached: preview.result.cache_status === "hit",
                    ...(preview.result.content_path
                      ? {
                          loadAudio: (options?: { signal?: AbortSignal }) =>
                            api.speech.previewContent(
                              preview.result.content_path!,
                              options?.signal
                            )
                        }
                      : {})
                  }
                })
              }
              onPlay={() => {
                onPlay();
                if (Date.parse(preview.result.expires_at) <= Date.now()) {
                  player.current?.pause();
                  setAudioError(true);
                }
              }}
              onError={() => setAudioError(true)}
            />
            {hasReview && reviewAudio && (
              <AudioReview
                compact
                key={`review:${reviewAudio.result.audioUrl}`}
                media={reviewAudio}
                onPlay={onPlay}
                onReadyChange={setReviewReady}
              />
            )}
            {audioError && (
              <Alert
                type="warning"
                showIcon
                title={t(
                  "audio_could_not_be_loaded_or_the_link_has_expired_generate_a_new_"
                )}
              />
            )}
          </Flex>
        </div>
      )}
    </div>
  );
}
