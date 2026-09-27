import { expect, it, vi } from "vitest";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { createGrammarFormPreviewAdapter } from "./grammarFormPreview";

it("关联词形解析后仍只发起一次整段合成，清除时去掉旧音素", async () => {
  const synthesize = vi
    .fn()
    .mockResolvedValue({ audioUrl: "audio", expiresAt: "", cached: false });
  const source: VoicePreviewAdapter = {
    listVoices: vi.fn().mockResolvedValue([{ id: "uk", locale: "en-GB" }]),
    synthesize
  };
  const resolve = vi.fn().mockResolvedValue([
    {
      source_segments: [{ start: 2, end: 5, surface: "job" }],
      dialect: "uk",
      pronunciations: [
        {
          id: "first",
          dict_phonetic: "",
          actual_pron: "",
          synthesis: { alphabet: "ipa", ipa: "dʒɒb", ups: "" }
        }
      ]
    }
  ]);
  const adapter = createGrammarFormPreviewAdapter(source, resolve);
  const input = {
    language: "en",
    voiceId: "uk",
    content: { version: 2 as const, text: "a job", annotations: [] }
  };
  await adapter.synthesize(input);
  expect(synthesize).toHaveBeenCalledTimes(1);
  expect(synthesize.mock.lastCall?.[0].content).toEqual({
    ...input.content,
    annotations: [
      { type: "phoneme", start: 2, end: 5, alphabet: "ipa", phoneme: "dʒɒb" }
    ]
  });
  resolve.mockResolvedValue([]);
  await adapter.synthesize({
    ...input,
    content: synthesize.mock.lastCall?.[0].content
  });
  expect(synthesize.mock.lastCall?.[0].content).toEqual(input.content);
  resolve.mockResolvedValue([
    {
      source_segments: [{ start: 2, end: 5, surface: "job" }],
      dialect: "uk",
      pronunciations: []
    }
  ]);
  await expect(adapter.synthesize(input)).rejects.toThrow(/第一个发音/);
  expect(synthesize).toHaveBeenCalledTimes(2);
});
