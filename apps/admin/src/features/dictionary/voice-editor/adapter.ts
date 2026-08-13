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

const PREVIEW_IN_PROGRESS_ATTEMPTS = 3;
const PREVIEW_RETRY_DELAY_MS = 250;

function safePreviewError(error: HttpError): VoicePreviewError {
  const code = errorCode(error);
  const messages: Record<VoicePreviewErrorCode, string> = {
    invalid_content: "试听内容或语音参数无效，请检查后重新生成",
    voice_not_found: "所选发音人不可用，请重新选择",
    preview_in_progress: "相同试听正在生成，请稍后重试",
    option_not_supported: "所选发音参数不受支持，请调整后重试",
    rate_limited: "试听请求过于频繁，请稍后手动重试",
    quota_exceeded: "试听额度暂不可用，请稍后重试",
    unavailable: "语音或存储服务暂不可用，请稍后手动重试",
    unknown: "试听请求失败，请重试"
  };
  return new VoicePreviewError(
    code,
    messages[code],
    code === "preview_in_progress" ||
      code === "rate_limited" ||
      code === "quota_exceeded" ||
      code === "unavailable" ||
      code === "unknown"
  );
}

function waitForRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, PREVIEW_RETRY_DELAY_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

function defaultCapabilityValue(min: number, max: number): number {
  return min <= 0 && 0 <= max ? 0 : min;
}

function errorCode(error: HttpError): VoicePreviewErrorCode {
  if (error.code === "speech_voice_not_found" || error.status === 404) {
    return "voice_not_found";
  }
  if (error.code === "speech_rate_limited") return "rate_limited";
  if (
    error.code === "speech_provider_unavailable" ||
    error.code === "speech_storage_unavailable"
  ) {
    return "unavailable";
  }
  if (error.code === "speech_preview_in_progress" || error.status === 409) {
    return "preview_in_progress";
  }
  if (
    error.code === "invalid_speech_preview" ||
    error.status === 400 ||
    error.status === 422
  ) {
    return "invalid_content";
  }
  if (error.status === 429) {
    return "rate_limited";
  }
  if (error.status >= 500) return "unavailable";
  return "unknown";
}

export function createAdminVoicePreviewAdapter(
  dataSource: AdminSpeechDataSource
): VoicePreviewAdapter {
  const catalog = new Map<
    string,
    AdminSpeechVoiceListResponse["items"][number]["capabilities"]
  >();
  return {
    async listVoices({ language, signal }) {
      try {
        if (language !== "en") return [];
        const response = await dataSource.voices(signal);
        catalog.clear();
        for (const voice of response.items) {
          catalog.set(voice.alias, voice.capabilities);
        }
        return response.items.map(mapVoice);
      } catch (error) {
        if (error instanceof HttpError) {
          throw safePreviewError(error);
        }
        throw error;
      }
    },
    async synthesize(input, options) {
      try {
        if (input.language !== "en") {
          throw new VoicePreviewError("invalid_content", "当前仅支持英语试听");
        }
        const capabilities = catalog.get(input.voiceId);
        if (!capabilities) {
          throw new VoicePreviewError(
            "voice_not_found",
            "所选发音人不可用，请重新选择"
          );
        }
        const ratePercent =
          input.ratePercent ??
          defaultCapabilityValue(
            capabilities.min_rate_percent,
            capabilities.max_rate_percent
          );
        const pitchSemitones =
          input.pitchSemitones ??
          defaultCapabilityValue(
            capabilities.min_pitch_semitones,
            capabilities.max_pitch_semitones
          );
        const unsupportedStyle =
          input.style !== undefined &&
          !capabilities.styles.includes(input.style);
        const unsupportedRate =
          !Number.isInteger(ratePercent) ||
          ratePercent < capabilities.min_rate_percent ||
          ratePercent > capabilities.max_rate_percent;
        const unsupportedPitch =
          !Number.isInteger(pitchSemitones) ||
          pitchSemitones < capabilities.min_pitch_semitones ||
          pitchSemitones > capabilities.max_pitch_semitones;
        if (unsupportedStyle || unsupportedRate || unsupportedPitch) {
          throw new VoicePreviewError(
            "option_not_supported",
            "所选发音参数不受支持，请调整后重试"
          );
        }
        const request = {
          content: input.content,
          voice_alias: input.voiceId,
          ...(input.style ? { style: input.style } : {}),
          rate_percent: ratePercent,
          pitch_semitones: pitchSemitones
        };
        for (
          let attempt = 1;
          attempt <= PREVIEW_IN_PROGRESS_ATTEMPTS;
          attempt += 1
        ) {
          try {
            return mapPreview(
              await dataSource.preview(request, options?.signal)
            );
          } catch (error) {
            if (
              !(error instanceof HttpError) ||
              errorCode(error) !== "preview_in_progress" ||
              attempt === PREVIEW_IN_PROGRESS_ATTEMPTS
            ) {
              throw error;
            }
            await waitForRetry(options?.signal);
          }
        }
        throw new VoicePreviewError(
          "preview_in_progress",
          "相同试听正在生成，请稍后重试",
          true
        );
      } catch (error) {
        if (error instanceof VoicePreviewError) throw error;
        if (error instanceof HttpError) {
          throw safePreviewError(error);
        }
        throw error;
      }
    }
  };
}
