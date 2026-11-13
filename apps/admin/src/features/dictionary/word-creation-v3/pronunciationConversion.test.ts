import { expect, it } from "vitest";
import type { SynthesisSpeechV3, WordPronunciationV3 } from "@tsz/types";
import { planPronunciationConversion } from "./pronunciationConversion";

const pronunciation: WordPronunciationV3 = {
  id: "reading",
  style: "normal",
  dict_phonetic: "bɪb",
  actual_pron: ""
};

it("通用读法分别转换英美音素，实际发音保持通用规则，输入不被修改", () => {
  const input = structuredClone(pronunciation);
  const result = planPronunciationConversion(input, "bib", "common");
  expect(result).toMatchObject({
    ok: true,
    plan: {
      patch: {
        actual_pron: "bɪb",
        actual_pron_rich: { version: 2, text: "bɪb", annotations: [] },
        synthesis: {
          uk: {
            ipa: "bɪp",
            ups: "B IH P",
            ups_words: [{ text: "bib", phoneme: "B IH P" }]
          },
          us: {
            ipa: "bɪb",
            ups: "B IH B",
            ups_words: [{ text: "bib", phoneme: "B IH B" }]
          }
        }
      },
      requiresConfirmation: false
    }
  });
  expect(input).toEqual(pronunciation);
});

const speech = (asset: string): SynthesisSpeechV3 => ({
  content: { version: 2, text: "bib", annotations: [] },
  voice_profile: {
    voices: [
      {
        voice_id: "voice",
        enabled: true,
        rate_percent: -20,
        audio_asset_id: asset
      }
    ]
  }
});

it("转换与撤销只失效改动音素的旧音频引用，保留来源、参数、另一侧和无关字段", () => {
  const input: WordPronunciationV3 = {
    ...pronunciation,
    actual_pron: "old",
    actual_pron_rich: {
      version: 2,
      text: "old",
      annotations: [{ type: "liaison", start: 0, end: 3 }]
    },
    synthesis: {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      use_spelling: true,
      uk: {
        source: "upload",
        ipa: "old",
        ups: "old",
        ipa_speech: speech("old-ipa"),
        ups_speech: speech("old-ups")
      },
      us: { source: "none", ipa: "original", ups: "original" }
    }
  };
  const before = structuredClone(input);
  const result = planPronunciationConversion(input, "bib", "uk");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  expect(result.plan.requiresConfirmation).toBe(true);
  expect(result.plan.patch.synthesis?.us).toEqual(input.synthesis?.us);
  expect(result.plan.patch.synthesis?.uk).toMatchObject({
    source: "upload",
    ipa: "bɪp",
    ups: "B IH P"
  });
  for (const field of ["ipa_speech", "ups_speech"] as const) {
    expect(result.plan.patch.synthesis?.uk?.[field]).toEqual({
      ...speech(""),
      voice_profile: {
        voices: [{ voice_id: "voice", enabled: true, rate_percent: -20 }]
      }
    });
    expect(result.plan.undo.synthesis?.uk?.[field]).toEqual(
      result.plan.patch.synthesis?.uk?.[field]
    );
  }
  expect(result.plan.undo.actual_pron_rich).toEqual(input.actual_pron_rich);
  expect(result.plan.undo.synthesis?.uk?.ipa).toBe("old");
  expect(result.plan.patch).not.toHaveProperty("audio_assets");
  expect(input).toEqual(before);
});

it("内容与词界没有改变时保留已有正式音频引用", () => {
  const input: WordPronunciationV3 = {
    ...pronunciation,
    actual_pron: "bɪp",
    synthesis: {
      alphabet: "ups",
      ipa: "",
      ups: "",
      uk: {
        source: "ipa",
        ipa: "bɪp",
        ups: "B IH P",
        ups_words: [{ text: "bib", phoneme: "B IH P" }],
        ipa_speech: speech("same-ipa"),
        ups_speech: speech("same-ups")
      }
    }
  };
  const result = planPronunciationConversion(input, "bib", "uk");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  expect(result.plan.patch.synthesis).toEqual(input.synthesis);
  expect(result.plan.requiresConfirmation).toBe(false);
});

it("美式转换失败时不返回已经算出的英式或实际发音补丁", () => {
  const input = {
    ...pronunciation,
    dict_phonetic: "ˈbʌtən",
    style: "weak" as const
  };
  const before = structuredClone(input);
  const result = planPronunciationConversion(input, "button", "common");
  expect(result).toMatchObject({
    ok: false,
    field: "us.ipa",
    message: expect.stringContaining("ʔ")
  });
  expect(result).not.toHaveProperty("plan");
  expect(input).toEqual(before);
});

it("短语同时生成 UPS 逐词边界，保留独立停顿配置", () => {
  const pause: SynthesisSpeechV3 = {
    content: {
      version: 2,
      text: "cat bib",
      annotations: [{ type: "pause", at: 3, duration_ms: 500 }]
    },
    voice_profile: { voices: [] }
  };
  const result = planPronunciationConversion(
    {
      ...pronunciation,
      dict_phonetic: "kæt bɪb",
      synthesis: {
        alphabet: "ipa",
        ipa: "",
        ups: "",
        us: { source: "none", ipa: "", ups: "", ups_speech: pause }
      }
    },
    "cat bib",
    "us"
  );
  expect(result).toMatchObject({
    ok: true,
    plan: {
      patch: {
        synthesis: {
          us: {
            ups_words: [
              { text: "cat", phoneme: "K AE T" },
              { text: "bib", phoneme: "B IH B" }
            ],
            ups_speech: pause
          }
        }
      }
    }
  });
});
