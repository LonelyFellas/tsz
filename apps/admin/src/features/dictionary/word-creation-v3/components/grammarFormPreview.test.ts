import { expect, it, vi } from "vitest";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { createGrammarFormPreviewAdapter } from "./grammarFormPreview";

it("新地区普通正文保持自然朗读，含词形引用时明确拒绝且不发起合成", async () => {
  const synthesize = vi
    .fn()
    .mockResolvedValue({ audioUrl: "audio", expiresAt: "", cached: false });
  const source: VoicePreviewAdapter = {
    listVoices: vi.fn().mockResolvedValue([{ id: "au", locale: "en-AU" }]),
    synthesize
  };
  const resolve = vi.fn().mockResolvedValue([]);
  const adapter = createGrammarFormPreviewAdapter(source, resolve);
  const input = {
    language: "en",
    voiceId: "au",
    content: { version: 2 as const, text: "a job", annotations: [] }
  };
  await adapter.synthesize(input);
  expect(synthesize).toHaveBeenCalledWith(input, undefined);
  resolve.mockResolvedValue([{ dialect: "uk", pronunciations: [] }]);
  await expect(adapter.synthesize(input)).rejects.toThrow(/指定音素/);
  expect(synthesize).toHaveBeenCalledTimes(1);
});

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

it("独立试听保留非关联选区的直接音标，关联范围按词库读法解析", async () => {
  const renderSsml = vi.fn().mockResolvedValue("<speak />");
  const source: VoicePreviewAdapter = {
    listVoices: vi.fn(),
    synthesize: vi.fn(),
    renderSsml
  };
  const content = {
    version: 2 as const,
    text: "record again",
    annotations: [
      {
        type: "phoneme" as const,
        start: 7,
        end: 12,
        alphabet: "ipa" as const,
        phoneme: "əˈɡen"
      }
    ]
  };
  const resolve = vi.fn().mockResolvedValue([
    {
      source_segments: [{ start: 0, end: 6, surface: "record" }],
      dialect: "uk",
      pronunciations: [
        {
          id: "reading",
          dict_phonetic: "",
          actual_pron: "",
          synthesis: {
            alphabet: "ipa",
            ipa: "rɛkɔd",
            ups: "",
            ipa_locale: "en-GB"
          }
        }
      ]
    }
  ]);
  const adapter = createGrammarFormPreviewAdapter(source, resolve, [], {
    preserveDirectPhonemes: true
  });
  await expect(
    adapter.renderSsml!({
      content,
      setting: {
        voice_id: "sonia",
        locale: "en-GB",
        enabled: true,
        rate_percent: 0
      }
    })
  ).resolves.toBe("<speak />");
  expect(renderSsml.mock.lastCall?.[0].content.annotations).toEqual([
    { type: "phoneme", start: 0, end: 6, alphabet: "ipa", phoneme: "rɛkɔd" },
    { type: "phoneme", start: 7, end: 12, alphabet: "ipa", phoneme: "əˈɡen" }
  ]);
  expect(content.annotations).toHaveLength(1);
});

it("关联词形解析中取消试听，不继续提交编译请求", async () => {
  let finish!: (value: []) => void;
  const resolve = vi.fn(
    () =>
      new Promise<[]>((done) => {
        finish = done;
      })
  );
  const renderSsml = vi.fn();
  const source: VoicePreviewAdapter = {
    listVoices: vi.fn(),
    synthesize: vi.fn(),
    renderSsml
  };
  const adapter = createGrammarFormPreviewAdapter(source, resolve, [], {
    preserveDirectPhonemes: true
  });
  const request = new AbortController();
  const result = adapter.renderSsml!(
    {
      content: { version: 2, text: "record", annotations: [] },
      setting: {
        voice_id: "sonia",
        locale: "en-GB",
        enabled: true,
        rate_percent: 0
      }
    },
    { signal: request.signal }
  );
  request.abort();
  finish([]);
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(renderSsml).not.toHaveBeenCalled();
});
