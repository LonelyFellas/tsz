import { HttpError } from "@tsz/api-client";
import type {
  AdminSpeechPreviewResponse,
  AdminSpeechVoiceListResponse
} from "@tsz/types";
import {
  VoicePreviewError,
  type VoiceOption,
  type VoicePreviewAdapter,
  type VoicePreviewErrorCode,
  type VoicePreviewResult
} from "@tsz/voice-editor/types";

export interface AdminSpeechDataSource {
  voices(signal?: AbortSignal): Promise<AdminSpeechVoiceListResponse>;
  preview(
    input: {
      content: Parameters<VoicePreviewAdapter["synthesize"]>[0]["content"];
      voice_alias: string;
      style?: string | null;
      rate_percent?: number;
      pitch_semitones?: number;
    },
    signal?: AbortSignal
  ): Promise<AdminSpeechPreviewResponse>;
}

function mapVoice(
  item: AdminSpeechVoiceListResponse["items"][number],
  index: number
): VoiceOption {
  const gender = item.gender.toLowerCase();
  const capabilities = item.capabilities;
  return {
    id: item.alias,
    label: `${item.alias} · ${item.locale}`,
    locale: item.locale,
    gender: gender === "female" || gender === "male" ? gender : "neutral",
    styles: [...capabilities.styles],
    supportsRate: capabilities.min_rate_percent < capabilities.max_rate_percent,
    supportsPitch:
      capabilities.min_pitch_semitones < capabilities.max_pitch_semitones,
    isDefault: index === 0,
    rateRange: {
      min: capabilities.min_rate_percent,
      max: capabilities.max_rate_percent
    },
    pitchRange: {
      min: capabilities.min_pitch_semitones,
      max: capabilities.max_pitch_semitones
    }
  };
}

function mapPreview(result: AdminSpeechPreviewResponse): VoicePreviewResult {
  return {
    audioUrl: result.audio_url,
    expiresAt: result.expires_at,
    cached: result.cache_status === "hit"
  };
}

function errorCode(error: HttpError): VoicePreviewErrorCode {
  if (error.code === "speech_voice_not_found" || error.status === 404) {
    return "voice_not_found";
  }
  if (error.code === "speech_rate_limited") return "rate_limited";
  if (
    error.code === "speech_provider_unavailable" ||
    error.code === "speech_storage_unavailable" ||
    error.code === "speech_preview_in_progress"
  ) {
    return "unavailable";
  }
  if (error.code === "invalid_speech_preview") return "invalid_content";
  if (error.status === 429) {
    return "rate_limited";
  }
  if (error.status >= 500) return "unavailable";
  if (error.status === 400) return "invalid_content";
  return "unknown";
}

export function createAdminVoicePreviewAdapter(
  dataSource: AdminSpeechDataSource
): VoicePreviewAdapter {
  return {
    async listVoices({ language, signal }) {
      try {
        if (language !== "en") return [];
        const response = await dataSource.voices(signal);
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
            content: input.content,
            voice_alias: input.voiceId,
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
