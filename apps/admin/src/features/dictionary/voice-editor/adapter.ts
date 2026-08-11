import { HttpError } from "@tsz/api-client";
import type {
  AdminTtsPreviewResponse,
  AdminTtsVoiceListResponse
} from "@tsz/types";
import {
  VoicePreviewError,
  type VoiceOption,
  type VoicePreviewAdapter,
  type VoicePreviewErrorCode,
  type VoicePreviewResult
} from "@tsz/voice-editor/types";

export interface AdminTtsDataSource {
  voices(
    language: "en",
    signal?: AbortSignal
  ): Promise<AdminTtsVoiceListResponse>;
  preview(
    input: {
      language: "en";
      content: Parameters<VoicePreviewAdapter["synthesize"]>[0]["content"];
      voice_id: string;
      style?: string;
      rate_percent?: number;
      pitch_semitones?: number;
    },
    signal?: AbortSignal
  ): Promise<AdminTtsPreviewResponse>;
}

function mapVoice(
  item: AdminTtsVoiceListResponse["items"][number]
): VoiceOption {
  return {
    id: item.id,
    label: item.label,
    locale: item.locale,
    gender: item.gender,
    styles: [...item.styles],
    supportsRate: item.supports_rate,
    supportsPitch: item.supports_pitch,
    isDefault: item.is_default
  };
}

function mapPreview(result: AdminTtsPreviewResponse): VoicePreviewResult {
  return {
    audioUrl: result.audio_url,
    expiresAt: result.expires_at,
    cached: result.cached,
    ssml: result.ssml
  };
}

function errorCode(error: HttpError): VoicePreviewErrorCode {
  if (error.code === "tts_voice_not_found" || error.status === 404) {
    return "voice_not_found";
  }
  if (error.code === "tts_quota_exceeded") return "quota_exceeded";
  if (error.code === "tts_rate_limited") return "rate_limited";
  if (error.code === "tts_unavailable") return "unavailable";
  if (error.code === "tts_option_not_supported") {
    return "option_not_supported";
  }
  if (error.code === "invalid_speech_markup") return "invalid_content";
  if (error.status === 429) {
    return error.code === "quota_exceeded" ? "quota_exceeded" : "rate_limited";
  }
  if (error.status >= 500) return "unavailable";
  if (error.code === "option_not_supported") return "option_not_supported";
  if (error.status === 400 || error.status === 422) return "invalid_content";
  return "unknown";
}

export function createAdminVoicePreviewAdapter(
  dataSource: AdminTtsDataSource
): VoicePreviewAdapter {
  return {
    async listVoices({ language, signal }) {
      try {
        if (language !== "en") return [];
        const response = await dataSource.voices(language, signal);
        return response.items.map(mapVoice);
      } catch (error) {
        if (error instanceof HttpError) {
          throw new VoicePreviewError(errorCode(error), error.message);
        }
        throw error;
      }
    },
    async synthesize(input, options) {
      try {
        if (input.language !== "en") {
          throw new VoicePreviewError("invalid_content", "当前仅支持英语试听");
        }
        const response = await dataSource.preview(
          {
            language: "en",
            content: input.content,
            voice_id: input.voiceId,
            ...(input.style ? { style: input.style } : {}),
            ...(input.ratePercent !== undefined
              ? { rate_percent: input.ratePercent }
              : {}),
            ...(input.pitchSemitones !== undefined
              ? { pitch_semitones: input.pitchSemitones }
              : {})
          },
          options?.signal
        );
        return mapPreview(response);
      } catch (error) {
        if (error instanceof VoicePreviewError) throw error;
        if (error instanceof HttpError) {
          throw new VoicePreviewError(errorCode(error), error.message);
        }
        throw error;
      }
    }
  };
}
