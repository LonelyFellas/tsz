import { describe, expect, it } from "vitest";
import type { RichTextV1, RichTextV2 } from "@tsz/types";
import type { VoiceSettings } from "../types";
import { VoicePreviewError } from "../types";
import {
  MAX_PAUSE_MS,
  MAX_RICH_TEXT_ANNOTATIONS,
  MAX_RICH_TEXT_CODE_POINTS,
  RichTextValidationError,
  buildSsmlPreview,
  canonicalVoiceHash,
  codePointLength,
  codePointSlice,
  codePointToUtf16Index,
  migrateRichTextV1,
  normalizeRichTextV2,
  selectedText,
  toRichTextV2,
  utf16IndexToCodePoint,
  validateRichTextV2
} from "./index";

const SETTINGS: VoiceSettings = {
  voiceId: "en-US-Ava<&\"'",
  style: "cheerful<&\"'",
  ratePercent: 10,
  pitchSemitones: -1
};

describe("Unicode code-point helpers", () => {
  it("round-trips every valid boundary across emoji, combining marks, IPA, and newline", () => {
    const value = "A😀e\u0301ɪ\n";
    const utf16Boundaries = [0, 1, 3, 4, 5, 6, 7];

    expect(codePointLength(value)).toBe(6);
    expect(codePointSlice(value, 1, 5)).toBe("😀e\u0301ɪ");
    utf16Boundaries.forEach((utf16, codePoint) => {
      expect(codePointToUtf16Index(value, codePoint)).toBe(utf16);
      expect(utf16IndexToCodePoint(value, utf16)).toBe(codePoint);
    });
  });

  it.each([-1, 7, 1.5])("rejects invalid code-point offset %s", (offset) => {
    expect(() => codePointToUtf16Index("A😀", offset)).toThrow(RangeError);
  });

  it.each([-1, 2, 4, 1.5])("rejects invalid UTF-16 index %s", (index) => {
    expect(() => utf16IndexToCodePoint("A😀", index)).toThrow(RangeError);
  });
});

describe("public errors", () => {
  it("retains a stable preview error code and name", () => {
    const error = new VoicePreviewError("quota_exceeded", "quota reached");
    expect(error).toMatchObject({
      name: "VoicePreviewError",
      code: "quota_exceeded",
      message: "quota reached"
    });
  });
});

describe("RichText V2 normalization and validation", () => {
  it("merges same semantic ranges despite interleaved marks, replaces duplicate pauses, and stays immutable", () => {
    const input: RichTextV2 = {
      version: 2,
      text: "abcdef",
      annotations: [
        { type: "emphasis", start: 2, end: 4, level: "strong" },
        { type: "highlight", start: 1, end: 3, color: "blue" },
        { type: "emphasis", start: 0, end: 2, level: "strong" },
        { type: "liaison", start: 0, end: 2 },
        { type: "liaison", start: 2, end: 4 },
        { type: "pause", at: 4, duration_ms: 200 },
        { type: "pause", at: 4, duration_ms: 800 }
      ]
    };
    const snapshot = structuredClone(input);

    expect(normalizeRichTextV2(input)).toEqual({
      version: 2,
      text: "abcdef",
      annotations: [
        /*
         * 两条相接的 liaison **不合并**：连读是「两点之间的一条连线」，
         * a‿b 与 b‿c 相接是连读链（pick‿it‿up）最常见的形态，合并成 a‿c
         * 会把两道弧变成一道错误的长弧。emphasis 那种「一段文字的属性」
         * 相接才该合并，见下一条 [0,2)+[2,4) → [0,4)。
         */
        { type: "liaison", start: 0, end: 2 },
        { type: "emphasis", start: 0, end: 4, level: "strong" },
        { type: "highlight", start: 1, end: 3, color: "blue" },
        { type: "liaison", start: 2, end: 4 },
        { type: "pause", at: 4, duration_ms: 800 }
      ]
    });
    expect(input).toEqual(snapshot);
  });

  it("returns precise issues for every invalid boundary", () => {
    const tooMany = Array.from(
      { length: MAX_RICH_TEXT_ANNOTATIONS + 1 },
      () => ({ type: "pause" as const, at: 0, duration_ms: 1 })
    );
    const value: RichTextV2 = {
      version: 2,
      text: `${"x".repeat(MAX_RICH_TEXT_CODE_POINTS)}x\ny`,
      annotations: [
        { type: "emphasis", start: 0, end: 0, level: "strong" },
        { type: "highlight", start: 0, end: 5003, color: "blue" },
        { type: "liaison", start: 5000, end: 5003 },
        { type: "phoneme", start: 1, end: 3, alphabet: "ipa", phoneme: "" },
        { type: "phoneme", start: 2, end: 4, alphabet: "ipa", phoneme: "a" },
        { type: "emphasis", start: 2, end: 5, level: "strong" },
        { type: "pause", at: 2, duration_ms: 300 },
        { type: "pause", at: 0, duration_ms: 0 },
        { type: "pause", at: 0, duration_ms: MAX_PAUSE_MS + 1 },
        { type: "pause", at: 0, duration_ms: 1.5 },
        ...tooMany
      ]
    };

    const codes = validateRichTextV2(value).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "text_too_long",
        "too_many_annotations",
        "invalid_range",
        "cross_paragraph",
        "invalid_phoneme",
        "overlapping_phoneme",
        "crossing_speech_marks",
        "pause_inside_phoneme",
        "invalid_pause"
      ])
    );
    expect(() => normalizeRichTextV2(value)).toThrow(RichTextValidationError);
  });

  it("uses fallback validation text, sort tie-breakers, and repeated speech conflict guards", () => {
    expect(new RichTextValidationError([]).message).toBe("富文本标注不合法");
    const issues = validateRichTextV2({
      version: 2,
      text: "abcd",
      annotations: [
        { type: "phoneme", start: 0, end: 3, alphabet: "ipa", phoneme: "a" },
        { type: "phoneme", start: 0, end: 2, alphabet: "ipa", phoneme: "b" },
        { type: "emphasis", start: 1, end: 4, level: "strong" },
        { type: "pause", at: 1, duration_ms: 300 },
        { type: "pause", at: 2, duration_ms: 400 }
      ]
    });
    expect(
      issues.filter((issue) => issue.code === "overlapping_phoneme")
    ).toHaveLength(1);
    expect(
      issues.filter((issue) => issue.code === "crossing_speech_marks")
    ).toHaveLength(1);
    expect(
      issues.filter((issue) => issue.code === "pause_inside_phoneme")
    ).toHaveLength(1);

    const normalized = normalizeRichTextV2({
      version: 2,
      text: "abcd",
      annotations: [
        { type: "highlight", start: 0, end: 2, color: "yellow" },
        { type: "highlight", start: 0, end: 2, color: "blue" },
        { type: "emphasis", start: 0, end: 2, level: "strong" },
        { type: "liaison", start: 2, end: 4 }
      ]
    });
    expect(normalized.annotations).toHaveLength(4);
  });

  it("accepts pause endpoints and rejects oversized IPA", () => {
    const valid: RichTextV2 = {
      version: 2,
      text: "ok",
      annotations: [
        { type: "pause", at: 0, duration_ms: 1 },
        { type: "pause", at: 2, duration_ms: MAX_PAUSE_MS }
      ]
    };
    expect(validateRichTextV2(valid)).toEqual([]);
    expect(
      validateRichTextV2({
        version: 2,
        text: "ok",
        annotations: [
          {
            type: "phoneme",
            start: 0,
            end: 1,
            alphabet: "ipa",
            phoneme: "a".repeat(201)
          }
        ]
      })[0]?.code
    ).toBe("invalid_phoneme");
  });

  it("accepts adjacent non-overlapping phonemes", () => {
    expect(
      validateRichTextV2({
        version: 2,
        text: "abcd",
        annotations: [
          { type: "phoneme", start: 0, end: 2, alphabet: "ipa", phoneme: "a" },
          { type: "phoneme", start: 2, end: 4, alphabet: "ipa", phoneme: "b" }
        ]
      })
    ).toEqual([]);
  });
});

describe("RichText compatibility and canonical hash", () => {
  it("migrates V1 bold, blue, and liaison points without mutating V1", () => {
    const input: RichTextV1 = {
      version: 1,
      text: "😀abcd",
      spans: [
        { start: 0, end: 1, type: "bold" },
        { start: 1, end: 3, type: "blue" }
      ],
      liaisons: [0, 2, 3]
    };
    const snapshot = structuredClone(input);

    const migrated = migrateRichTextV1(input);
    /*
     * 连读点 0、2、3 里，点 1 不是连读点，所以 [0,2) 与 [2,4) 只是首尾相接、
     * 并非同一段，必须分开——早先它们被合并成 [0,5)，等于凭空多出一处点 1
     * 的连读。点 2 与点 3 相邻，[2,4) 与 [3,5) 真重叠，合并成 [2,5) 是对的。
     */
    expect(migrated.annotations).toEqual(
      expect.arrayContaining([
        { type: "emphasis", start: 0, end: 1, level: "strong" },
        { type: "highlight", start: 1, end: 3, color: "blue" },
        { type: "liaison", start: 0, end: 2 },
        { type: "liaison", start: 2, end: 5 }
      ])
    );
    expect(input).toEqual(snapshot);
    expect(toRichTextV2(input)).toEqual(migrated);
    expect(selectedText(input, 0, 2)).toBe("😀a");
  });

  it("hashes canonical semantics and changes on content or voice settings", () => {
    const first: RichTextV2 = {
      version: 2,
      text: "hello",
      annotations: [
        { type: "emphasis", start: 0, end: 2, level: "strong" },
        { type: "highlight", start: 1, end: 3, color: "green" },
        { type: "emphasis", start: 2, end: 4, level: "strong" }
      ]
    };
    const equivalent: RichTextV2 = {
      version: 2,
      text: "hello",
      annotations: [
        { type: "emphasis", start: 0, end: 4, level: "strong" },
        { type: "highlight", start: 1, end: 3, color: "green" }
      ]
    };
    const hash = canonicalVoiceHash(first, SETTINGS);

    expect(canonicalVoiceHash(equivalent, SETTINGS)).toBe(hash);
    expect(
      canonicalVoiceHash({ ...equivalent, text: "hello!" }, SETTINGS)
    ).not.toBe(hash);
    expect(
      canonicalVoiceHash(equivalent, { ...SETTINGS, voiceId: "other" })
    ).not.toBe(hash);
    expect(
      canonicalVoiceHash(equivalent, { ...SETTINGS, style: "sad" })
    ).not.toBe(hash);
    expect(
      canonicalVoiceHash(equivalent, { ...SETTINGS, ratePercent: 5 })
    ).not.toBe(hash);
    expect(
      canonicalVoiceHash(equivalent, { ...SETTINGS, pitchSemitones: 2 })
    ).not.toBe(hash);
    expect(canonicalVoiceHash(equivalent)).toHaveLength(8);
  });
});

describe("SSML", () => {
  it("renders speech annotations, paragraph and trailing pauses, prosody, and style deterministically", () => {
    const value: RichTextV2 = {
      version: 2,
      text: "hello\nworld",
      annotations: [
        { type: "emphasis", start: 0, end: 5, level: "strong" },
        {
          type: "phoneme",
          start: 0,
          end: 5,
          alphabet: "ipa",
          phoneme: "həˈləʊ"
        },
        { type: "pause", at: 6, duration_ms: 300 },
        { type: "pause", at: 11, duration_ms: 800 },
        { type: "liaison", start: 6, end: 8 },
        { type: "highlight", start: 8, end: 11, color: "pink" }
      ]
    };

    const result = buildSsmlPreview(value, {
      ...SETTINGS,
      locale: "en-US"
    });
    expect(result).toContain(
      '<emphasis level="strong"><phoneme alphabet="ipa" ph="həˈləʊ">hello</phoneme></emphasis>'
    );
    expect(result).toContain('<break time="500ms"/><break time="300ms"/>world');
    expect(result).toContain('<break time="800ms"/>');
    expect(result).toContain('<prosody rate="+10%" pitch="-1st">');
    expect(result).toContain(
      '<mstts:express-as style="cheerful&lt;&amp;&quot;&apos;" styledegree="1">'
    );
    expect(result).not.toContain("liaison");
    expect(result).not.toContain("highlight");
  });

  it("escapes every XML-controlled field and omits zero prosody", () => {
    const result = buildSsmlPreview(
      {
        version: 2,
        text: "<&>\"'",
        annotations: [
          {
            type: "phoneme",
            start: 0,
            end: 5,
            alphabet: "ipa",
            phoneme: "<&>\"'"
          }
        ]
      },
      {
        voiceId: SETTINGS.voiceId,
        locale: "en<&>\"'",
        ratePercent: 0,
        pitchSemitones: 0
      }
    );
    expect(result).toContain('xml:lang="en&lt;&amp;&gt;&quot;&apos;"');
    expect(result).toContain('name="en-US-Ava&lt;&amp;&quot;&apos;"');
    expect(result).toContain('ph="&lt;&amp;&gt;&quot;&apos;"');
    expect(result).toContain("&lt;&amp;&gt;&quot;&apos;</phoneme>");
    expect(result).not.toContain("<prosody");
    expect(
      buildSsmlPreview(
        { version: 2, text: "test", annotations: [] },
        {
          voiceId: "voice",
          locale: "en-US",
          ratePercent: -5,
          pitchSemitones: 2
        }
      )
    ).toContain('<prosody rate="-5%" pitch="+2st">');
  });
});
