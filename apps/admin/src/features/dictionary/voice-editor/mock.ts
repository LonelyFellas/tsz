import { canonicalVoiceHash } from "@tsz/voice-editor/core";
import type {
  AudioUploadAdapter,
  VoiceOption,
  VoicePreviewAdapter
} from "@tsz/voice-editor/types";

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export const MOCK_VOICES: VoiceOption[] = [
  {
    id: "en-GB-Sonia",
    label: "Sonia · 英式女声",
    locale: "en-GB",
    gender: "female",
    styles: ["cheerful", "sad"],
    supportsRate: true,
    supportsPitch: true,
    isDefault: true
  },
  {
    id: "en-GB-Ryan",
    label: "Ryan · 英式男声",
    locale: "en-GB",
    gender: "male",
    styles: [],
    supportsRate: true,
    supportsPitch: false,
    isDefault: false
  },
  {
    id: "en-US-Aria",
    label: "Aria · 美式女声",
    locale: "en-US",
    gender: "female",
    styles: ["cheerful"],
    supportsRate: true,
    supportsPitch: true,
    isDefault: false
  },
  {
    id: "en-US-Guy",
    label: "Guy · 美式男声",
    locale: "en-US",
    gender: "male",
    styles: [],
    supportsRate: true,
    supportsPitch: false,
    isDefault: false
  }
];

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

export function createMockVoicePreviewAdapter(): VoicePreviewAdapter {
  const cache = new Set<string>();
  return {
    async listVoices({ language, signal }) {
      if (signal?.aborted) throw abortError();
      return language === "en"
        ? MOCK_VOICES.map((voice) => ({
            ...voice,
            styles: [...voice.styles]
          }))
        : [];
    },
    async synthesize(input, options) {
      if (options?.signal?.aborted) throw abortError();
      const voice = MOCK_VOICES.find((item) => item.id === input.voiceId);
      if (!voice) throw new Error("mock voice not found");
      const hash = canonicalVoiceHash(input.content, input);
      const cached = cache.has(hash);
      if (
        import.meta.env.DEV &&
        import.meta.env.VITE_LOCAL_SPEECH_MOCK === "true"
      ) {
        const response = await fetch("/__mock/voice-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: options?.signal
        });
        if (!response.ok) throw new Error("本机演示语音暂时不可用");
        const audioUrl = URL.createObjectURL(await response.blob());
        cache.add(hash);
        return {
          audioUrl,
          cached,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          dispose: () => URL.revokeObjectURL(audioUrl)
        };
      }
      cache.add(hash);
      return {
        audioUrl: SILENT_WAV,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        cached
      };
    }
  };
}

/**
 * 上传音频的假适配器：不发请求，报两次进度后按传入的归属与文件名落成一条假资产；
 * 试听给静音音频。只用于后端未落地时调 UI 与 jsdom 用例。
 */
export function createMockAudioUploadAdapter(): AudioUploadAdapter {
  let seq = 0;
  return {
    isStorageUnavailable: () => false,
    async upload({ file, locale, gender, signal, onProgress }) {
      if (signal?.aborted) throw abortError();
      onProgress?.(0.4);
      await Promise.resolve();
      if (signal?.aborted) throw abortError();
      onProgress?.(1);
      seq += 1;
      return {
        id: `mock-audio-${seq}`,
        locale,
        gender,
        content_type: file.type,
        size_bytes: file.size,
        duration_ms: null,
        original_name: file.name,
        created_at: new Date().toISOString()
      };
    },
    async resolveUrl(_assetId, options) {
      if (options?.signal?.aborted) throw abortError();
      return {
        url: SILENT_WAV,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString()
      };
    }
  };
}
