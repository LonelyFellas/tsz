import { describe, expect, it } from "vitest";
import type { RichTextAnnotation, RichTextV1, RichTextV2 } from "@tsz/types";
import {
  MAX_PHONEME_CODE_POINTS,
  MAX_RICH_TEXT_ANNOTATIONS,
  MAX_RICH_TEXT_CODE_POINTS,
  richTextLimitIssues
} from "./limits";

/** BMP 外字符：UTF-16 里占 2 个 code unit，用来证明计数走的是码点。 */
const ASTRAL = "😀";

function v2(text: string, annotations: RichTextAnnotation[] = []): RichTextV2 {
  return { version: 2, text, annotations };
}

function v1(partial: Partial<RichTextV1> = {}): RichTextV1 {
  return { version: 1, text: "", spans: [], liaisons: [], ...partial };
}

function phoneme(value: string): RichTextAnnotation {
  return { type: "phoneme", start: 0, end: 1, alphabet: "ipa", phoneme: value };
}

function emphasis(): RichTextAnnotation {
  return { type: "emphasis", start: 0, end: 1, level: "strong" };
}

describe("richTextLimitIssues", () => {
  it("正文按码点计数，恰好等于上限放行", () => {
    expect(
      richTextLimitIssues(v2("x".repeat(MAX_RICH_TEXT_CODE_POINTS)))
    ).toEqual([]);
    // .length 是 10000,码点才是 5000——用 UTF-16 长度会在这里误拦。
    const astralText = ASTRAL.repeat(MAX_RICH_TEXT_CODE_POINTS);
    expect(astralText.length).toBe(MAX_RICH_TEXT_CODE_POINTS * 2);
    expect(richTextLimitIssues(v2(astralText))).toEqual([]);
  });

  it("正文超限时说明超了多少（码点，不是 UTF-16 length）", () => {
    expect(
      richTextLimitIssues(v2(ASTRAL.repeat(MAX_RICH_TEXT_CODE_POINTS + 3)))
    ).toEqual([
      {
        code: "text_too_long",
        message: "正文 5003 个字符，超出上限 5000，请删减 3 个字符"
      }
    ]);
  });

  it("V1 正文同样按码点计数", () => {
    expect(
      richTextLimitIssues(
        v1({ text: ASTRAL.repeat(MAX_RICH_TEXT_CODE_POINTS + 1) })
      )
    ).toEqual([
      {
        code: "text_too_long",
        message: "正文 5001 个字符，超出上限 5000，请删减 1 个字符"
      }
    ]);
  });

  it("V2 标注数超限时给出删减量，恰好等于上限放行", () => {
    const exact = Array.from({ length: MAX_RICH_TEXT_ANNOTATIONS }, emphasis);
    expect(richTextLimitIssues(v2("ab", exact))).toEqual([]);
    expect(richTextLimitIssues(v2("ab", [...exact, emphasis()]))).toEqual([
      {
        code: "too_many_annotations",
        message: "标注 501 个，超出上限 500，请删减 1 个"
      }
    ]);
  });

  it("V1 的 spans 与 liaisons 各自独立计 500，不是合计", () => {
    const spans: RichTextV1["spans"] = Array.from(
      { length: MAX_RICH_TEXT_ANNOTATIONS },
      () => ({ start: 0, end: 1, type: "bold" as const })
    );
    const liaisons = Array.from(
      { length: MAX_RICH_TEXT_ANNOTATIONS },
      (_, index) => index
    );
    // 合计 1000 > 500,但两侧各自都没超,后端接受,前端也必须放行。
    expect(richTextLimitIssues(v1({ spans, liaisons }))).toEqual([]);
    expect(
      richTextLimitIssues(
        v1({
          spans: [...spans, { start: 0, end: 1, type: "blue" }],
          liaisons: [...liaisons, 1]
        })
      )
    ).toEqual([
      {
        code: "too_many_annotations",
        message: "文本样式标注 501 个，超出上限 500，请删减 1 个"
      },
      {
        code: "too_many_annotations",
        message: "连读标注 501 个，超出上限 500，请删减 1 个"
      }
    ]);
  });

  it("IPA 音素不能为空（仅空白也算空）", () => {
    expect(richTextLimitIssues(v2("ab", [phoneme("  ")]))).toEqual([
      {
        code: "invalid_phoneme",
        message: "第 1 个 IPA 标注为空，请填写音素或删除该标注"
      }
    ]);
  });

  it("IPA 音素按码点计 200，超限时指名是第几个", () => {
    expect(
      richTextLimitIssues(
        v2("ab", [
          phoneme(ASTRAL.repeat(MAX_PHONEME_CODE_POINTS)),
          phoneme(ASTRAL.repeat(MAX_PHONEME_CODE_POINTS + 2))
        ])
      )
    ).toEqual([
      {
        code: "invalid_phoneme",
        message: "第 2 个 IPA 标注 202 个字符，超出上限 200，请删减 2 个字符"
      }
    ]);
  });

  it("停顿必须是 1–5000ms 的整数", () => {
    const invalid = [0, -1, 5001, 300.5];
    for (const duration of invalid) {
      expect(
        richTextLimitIssues(
          v2("ab", [{ type: "pause", at: 1, duration_ms: duration }])
        )
      ).toEqual([
        {
          code: "invalid_pause",
          message: `第 1 个停顿时长 ${duration}ms 不合法，必须是 1–5000ms 的整数`
        }
      ]);
    }
    for (const duration of [1, 300, 5000]) {
      expect(
        richTextLimitIssues(
          v2("ab", [{ type: "pause", at: 1, duration_ms: duration }])
        )
      ).toEqual([]);
    }
  });

  it("其余标注类型不参与逐条校验", () => {
    expect(
      richTextLimitIssues(
        v2("ab", [
          emphasis(),
          { type: "liaison", start: 0, end: 2 },
          { type: "highlight", start: 0, end: 1, color: "yellow" },
          phoneme("æ")
        ])
      )
    ).toEqual([]);
  });
});
