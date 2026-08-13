import { canonicalVoiceHash } from "@tsz/voice-editor/core";
import type { VoiceOption, VoicePreviewAdapter } from "@tsz/voice-editor/types";

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
      cache.add(hash);
      return {
        audioUrl: SILENT_WAV,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        cached
      };
    }
  };
}
