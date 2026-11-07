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
  comparison?: string;
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
  const [audioError, setAudioError] = useState(false);
  const [reviewAudio, setReviewAudio] = useState<ReviewAudio>();
  // 在新音频触发加载事件前清理旧状态，避免覆盖当前的加载错误。
  useLayoutEffect(() => {
    setAudioError(false);
    setReviewAudio(undefined);
  }, [preview?.result.audio_url]);
  return (
    <div className="voice-library-preview" aria-live="polite">
      {pending && (
        <Space>
          <Volume2Icon />
          <Typography.Text type="secondary">正在生成试听…</Typography.Text>
          <Button type="link" size="small" onClick={onCancel}>
            取消
          </Button>
        </Space>
      )}
      {error && <Alert type="error" showIcon title={error} />}
      {!pending && !error && !preview && (
        <div className="voice-library-preview-empty">
          <Volume2Icon />
          <Typography.Text type="secondary">暂无试听音频</Typography.Text>
        </div>
      )}
      {preview && (
        <div className="voice-library-player">
          <Flex vertical gap={8}>
            <Space wrap>
              <VoiceName voice={preview.voice} />
              <Tag>
                {preview.comparison ??
                  (preview.voice.locale === "en-GB"
                    ? "英式英语"
                    : preview.voice.locale === "en-US"
                      ? "美式英语"
                      : preview.voice.locale)}
              </Tag>
              <Typography.Text type="secondary">
                本次试听：音量 <VoiceVolume parameters={preview.parameters} />，
                <VoiceRate parameters={preview.parameters} />
                {preview.parameters.style
                  ? `，${styleNames[preview.parameters.style] ?? preview.parameters.style}`
                  : "，默认"}
              </Typography.Text>
            </Space>
            <audio
              key={`audio:${preview.result.audio_url}`}
              ref={player}
              controls
              autoPlay
              aria-label={`${preview.voice.display_name} 试听播放器`}
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
            {reviewAudio &&
              reviewAudio.result.audioUrl === preview.result.audio_url && (
                <AudioReview
                  key={`review:${reviewAudio.result.audioUrl}`}
                  media={reviewAudio}
                  onPlay={onPlay}
                />
              )}
            {audioError && (
              <Alert
                type="warning"
                showIcon
                title="音频加载失败或链接已过期，请重新生成试听。"
              />
            )}
            <Typography.Text type="secondary">
              {audioError
                ? "请重新点击试听。"
                : "若未自动播放，请点击播放按钮。"}
            </Typography.Text>
          </Flex>
        </div>
      )}
    </div>
  );
}
