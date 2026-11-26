import { expect, it } from "vitest";
import type { NextDraft, NextSentence } from "@tsz/types";
import {
  cleanSentenceVariant,
  draftSentenceError,
  sentenceChanges,
  useSentenceDrafts
} from "./sentenceDrafts";
import { act, renderHook } from "@testing-library/react";

const source: NextSentence = {
  id: "sentence",
  target_language: "en",
  owner_id: "owner",
  revision: 3,
  updated_at: "",
  reference_count: 2,
  draft: {
    schema_version: 1,
    variants: [
      {
        id: "uk",
        locale: "en-GB",
        level: "A1",
        content: { version: 2, text: "A centre.", annotations: [] },
        translations: [
          {
            id: "hant",
            locale: "zh-Hant",
            style: "balanced_fluency",
            content: { version: 2, text: "保留繁體", annotations: [] }
          }
        ]
      },
      {
        id: "us",
        locale: "en-US",
        level: "A2",
        content: { version: 2, text: "A center.", annotations: [] },
        translations: []
      }
    ]
  }
};
it("只提交变更的语言，保留共同修订并排除其他媒介语与已移除引用", () => {
  const value = structuredClone(source);
  value.draft.variants[0]!.content.text = "British draft.";
  value.draft.variants[1]!.content.text = "American draft.";
  const changes = sentenceChanges(
    [source],
    { sentence: value },
    ["sentence"],
    "zh-Hans"
  );
  expect(
    changes.map((v) => [v.id, v.expected_revision, v.target_locale])
  ).toEqual([
    ["sentence", 3, "en-GB"],
    ["sentence", 3, "en-US"]
  ]);
  expect(changes.every((v) => v.variant.translations.length === 0)).toBe(true);
  expect(
    value.draft.variants.find((v) => v.locale === "en-GB")!.translations[0]!
      .content.text
  ).toBe("保留繁體");
  expect(sentenceChanges([source], { sentence: value }, [], "zh-Hans")).toEqual(
    []
  );
  expect(
    sentenceChanges(
      [source],
      { sentence: structuredClone(source) },
      ["sentence"],
      "zh-Hans"
    )
  ).toEqual([]);
});
it("默认零分的空白译文不提交，非零评分的半填行须补齐正文", () => {
  const value = structuredClone(source.draft.variants[1]!);
  const empty = {
    id: "empty",
    locale: "zh-Hans",
    style: "balanced_fluency" as const,
    content: { version: 2 as const, text: "", annotations: [] },
    metadata: { freedom: null as number | null, sources: [] }
  };
  value.translations = [empty];
  expect(cleanSentenceVariant(value).translations).toEqual([]);
  value.translations.push({
    ...empty,
    id: "zero",
    metadata: { freedom: 0, sources: [] }
  });
  expect(cleanSentenceVariant(value).translations).toEqual([]);
  value.translations.push({
    ...empty,
    id: "scored",
    metadata: { freedom: 52, sources: [] }
  });
  expect(cleanSentenceVariant(value).translations.map((v) => v.id)).toEqual([
    "scored"
  ]);
  expect(
    draftSentenceError([
      {
        id: "sentence",
        expected_revision: 3,
        target_locale: "en-US",
        medium_locale: "zh-Hans",
        variant: cleanSentenceVariant(value)
      }
    ])
  ).toContain("译文不能为空");
});
it("有正文的历史空值按零分提交，已有评分保留且不改输入", () => {
  const value = structuredClone(source.draft.variants[1]!);
  const legacy = {
    id: "legacy",
    locale: "zh-Hans",
    style: "balanced_fluency" as const,
    content: { version: 2 as const, text: "译文", annotations: [] },
    metadata: { freedom: null as number | null, sources: [] }
  };
  value.translations = [
    legacy,
    { ...legacy, id: "scored", metadata: { freedom: 52, sources: [] } }
  ];
  const rows = cleanSentenceVariant(value).translations;
  expect(rows[0]).toMatchObject({
    style: "word_for_word",
    metadata: { freedom: 0 }
  });
  expect(rows[1]).toEqual(value.translations[1]);
  expect(value.translations[0]!.metadata!.freedom).toBeNull();
});
it("新引用的既有资源保留原版本，修改不能误认为新建或无变更", () => {
  const word: NextDraft = {
    schema_version: 1 as const,
    headword: "centre",
    forms: [],
    senses: [
      {
        id: "sense",
        part_of_speech: "noun",
        definitions: [],
        equivalents: [],
        sentence_ids: [source.id]
      }
    ]
  };
  const { result } = renderHook(() => useSentenceDrafts([], word, "zh-Hans"));
  act(() => result.current.importResource(source));
  expect(result.current.dirty).toBe(false);
  act(() =>
    result.current.update(source, {
      ...source.draft.variants[0]!,
      content: { version: 2, text: "Imported edit.", annotations: [] }
    })
  );
  expect(result.current.changes[0]).toMatchObject({
    id: source.id,
    expected_revision: 3,
    target_locale: "en-GB"
  });
  expect(
    result.current.resources[source.id]!.draft.variants.find(
      (v) => v.locale === "en-GB"
    )!.translations[0]!.locale
  ).toBe("zh-Hant");
});

it("提交文字时只解除与新正文不匹配的旧合成音频，保留新生成的版本", () => {
  const saved = structuredClone(source);
  const uk = saved.draft.variants[0]!;
  uk.voice_profile = {
    voices: [
      {
        voice_id: "first",
        enabled: true,
        rate_percent: 0,
        audio_asset_id: "old-first"
      },
      {
        voice_id: "second",
        enabled: true,
        rate_percent: 0,
        audio_asset_id: "old-second"
      }
    ]
  };
  const edited = structuredClone(saved);
  const variant = edited.draft.variants[0]!;
  variant.translations = [];
  const payload = () =>
    sentenceChanges([saved], { sentence: edited }, [saved.id], "zh-Hant")[0]!
      .variant;
  uk.content = {
    version: 1,
    text: variant.content.text,
    spans: [],
    liaisons: []
  };
  expect(payload().voice_profile).toEqual(uk.voice_profile);
  uk.content = {
    version: 2,
    text: variant.content.text,
    annotations: [{ at: 2, duration_ms: 250, type: "pause" }]
  };
  variant.content = {
    version: 2,
    text: uk.content.text,
    annotations: [{ type: "pause", at: 2, duration_ms: 250 }]
  };
  expect(payload().voice_profile).toEqual(uk.voice_profile);
  variant.content.text = "New text.";
  variant.voice_profile!.voices[0]!.audio_asset_id = "new-first";
  const voices = payload().voice_profile!.voices;
  expect(voices[0]!.audio_asset_id).toBe("new-first");
  expect(voices[1]).toEqual({
    voice_id: "second",
    enabled: true,
    rate_percent: 0
  });
  expect(uk.voice_profile.voices[1]!.audio_asset_id).toBe("old-second");
  variant.content = uk.content;
  variant.voice_profile!.voices[1]!.rate_percent = 15;
  expect(payload().voice_profile!.voices[1]!.audio_asset_id).toBeUndefined();
});

it("未保存的正文和配音变更不预览旧录音，原草稿绑定保留供保存复用", () => {
  const audioSource = structuredClone(source);
  audioSource.draft.variants[0]!.voice_profile = {
    voices: [
      {
        voice_id: "voice",
        enabled: true,
        rate_percent: 0,
        audio_asset_id: "old-audio"
      }
    ]
  };
  const word: NextDraft = {
    schema_version: 1 as const,
    headword: "centre",
    forms: [],
    senses: [
      {
        id: "sense",
        part_of_speech: "noun",
        definitions: [],
        equivalents: [],
        sentence_ids: [source.id]
      }
    ]
  };
  const { result } = renderHook(() =>
    useSentenceDrafts([audioSource], word, "zh-Hans")
  );
  const variant = () =>
    result.current.previewResources[source.id]!.draft.variants.find(
      (v) => v.locale === "en-GB"
    )!;
  expect(variant().voice_profile?.voices[0]!.audio_asset_id).toBe("old-audio");
  act(() =>
    result.current.update(audioSource, {
      ...audioSource.draft.variants[0]!,
      content: { version: 2, text: "Changed text.", annotations: [] }
    })
  );
  expect(variant().voice_profile).toBeUndefined();
  expect(
    result.current.resources[source.id]!.draft.variants.find(
      (v) => v.locale === "en-GB"
    )!.voice_profile?.voices[0]!.audio_asset_id
  ).toBe("old-audio");
  act(() =>
    result.current.update(audioSource, {
      ...audioSource.draft.variants[0]!,
      voice_profile: {
        voices: [
          {
            voice_id: "voice",
            enabled: true,
            rate_percent: 10,
            audio_asset_id: "old-audio"
          }
        ]
      }
    })
  );
  expect(variant().voice_profile).toBeUndefined();
  act(() => result.current.update(audioSource, audioSource.draft.variants[0]!));
  expect(variant().voice_profile?.voices[0]!.audio_asset_id).toBe("old-audio");
});
