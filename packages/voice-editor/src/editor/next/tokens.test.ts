import { describe, expect, it } from "vitest";
import type { RichTextAnnotation, RichTextV2 } from "@tsz/types";
import {
  EMPTY_MARKS,
  anchorLetters,
  graphemes,
  anchorRange,
  annotationsToMarks,
  extendAnchor,
  isValidAnchor,
  isValidLiaison,
  marksToAnnotations,
  offsetToAnchor,
  remapMarks,
  tokenize,
  type MarkState
} from "./tokens";

const TEXT = "a centre of the city";
//            0 2      9  12  16

describe("tokenize", () => {
  it("returns code-point ranges for each whitespace-separated word", () => {
    expect(tokenize(TEXT)).toEqual([
      { index: 0, start: 0, end: 1, text: "a" },
      { index: 1, start: 2, end: 8, text: "centre" },
      { index: 2, start: 9, end: 11, text: "of" },
      { index: 3, start: 12, end: 15, text: "the" },
      { index: 4, start: 16, end: 20, text: "city" }
    ]);
  });

  it("ignores leading, trailing and repeated whitespace", () => {
    expect(tokenize("  a   b \n c  ").map((token) => token.text)).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  it("counts astral characters as single code points", () => {
    // "🙂" 是一个码点、两个 UTF-16 单元；偏移必须按码点算。
    expect(tokenize("🙂 ok")).toEqual([
      { index: 0, start: 0, end: 1, text: "🙂" },
      { index: 1, start: 2, end: 4, text: "ok" }
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("连读锚点换算", () => {
  const tokens = tokenize(TEXT);

  it("单字母锚点换算成绝对码点区间", () => {
    // "centre" 的第 3 个字母 t
    expect(anchorRange(tokens, { token: 1, offsets: [2] })).toEqual({
      start: 4,
      end: 5
    });
  });

  it("多字母锚点覆盖整段连续字母", () => {
    // "centre" 的 "re"
    expect(anchorRange(tokens, { token: 1, offsets: [4, 5] })).toEqual({
      start: 6,
      end: 8
    });
  });

  it("越过词长的锚点作废，不会串到下一个词", () => {
    expect(anchorRange(tokens, { token: 0, offsets: [1] })).toBeUndefined();
    expect(anchorRange(tokens, { token: 1, offsets: [5, 6] })).toBeUndefined();
    expect(anchorRange(tokens, { token: 9, offsets: [0] })).toBeUndefined();
  });

  it("回显锚点选中的字母", () => {
    expect(anchorLetters(tokens, { token: 1, offsets: [4, 5] })).toBe("re");
    expect(anchorLetters(tokens, { token: 9, offsets: [0] })).toBe("");
  });

  it("锚点必须是词内连续字母", () => {
    expect(isValidAnchor({ token: 1, offsets: [1, 2, 3] })).toBe(true);
    expect(isValidAnchor({ token: 1, offsets: [1, 3] })).toBe(false);
    expect(isValidAnchor({ token: 1, offsets: [] })).toBe(false);
  });

  it("并入字母：紧邻则扩展，否则重开", () => {
    const anchor = { token: 1, offsets: [2, 3] };
    expect(extendAnchor(anchor, 4).offsets).toEqual([2, 3, 4]);
    expect(extendAnchor(anchor, 1).offsets).toEqual([1, 2, 3]);
    // 隔开的字母不接龙，直接重开
    expect(extendAnchor(anchor, 5).offsets).toEqual([5]);
    // 再点已选中的字母也重开，给一个就地重来的出口
    expect(extendAnchor(anchor, 2).offsets).toEqual([2]);
  });

  it("绝对位置换回锚点，落在空白上则无锚点", () => {
    expect(offsetToAnchor(tokens, 4)).toEqual({ token: 1, offsets: [2] });
    expect(offsetToAnchor(tokens, 1)).toBeUndefined();
  });

  it("连读必须跨词且终点在右", () => {
    expect(
      isValidLiaison({
        start: { token: 0, offsets: [0] },
        end: { token: 1, offsets: [0] }
      })
    ).toBe(true);
    // 同词内部连线没有意义
    expect(
      isValidLiaison({
        start: { token: 1, offsets: [0] },
        end: { token: 1, offsets: [3] }
      })
    ).toBe(false);
    // 终点在左
    expect(
      isValidLiaison({
        start: { token: 3, offsets: [0] },
        end: { token: 1, offsets: [0] }
      })
    ).toBe(false);
  });
});

describe("marksToAnnotations", () => {
  it("maps a word role onto that word's exact range", () => {
    const marks: MarkState = {
      roles: { 1: "core" },
      liaisons: [],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "strong" }
    ]);
  });

  it("连读落成从起点字母到终点字母的区间", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [
        // centre 的 e(末字母, offset 5) → of 的 o(offset 0)
        { start: { token: 1, offsets: [5] }, end: { token: 2, offsets: [0] } }
      ],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      { type: "liaison", start: 7, end: 10 }
    ]);
  });

  it("连读可以跨越任意距离，不限于相邻词", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [
        { start: { token: 0, offsets: [0] }, end: { token: 4, offsets: [3] } }
      ],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      { type: "liaison", start: 0, end: 20 }
    ]);
  });

  it("锚点越界的连读整条丢弃，不落半条线", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [
        { start: { token: 0, offsets: [5] }, end: { token: 2, offsets: [0] } },
        { start: { token: 0, offsets: [0] }, end: { token: 9, offsets: [0] } }
      ],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([]);
  });

  it("places a pause right after the left-hand word", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [],
      pauses: { 1: 500 },
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      { type: "pause", at: 8, duration_ms: 500 }
    ]);
  });

  it("drops gap marks that have no word on the right", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [],
      pauses: { 4: 500, 9: 500 },
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([]);
  });

  it("drops role marks pointing past the last word", () => {
    const marks: MarkState = {
      roles: { 9: "core" },
      liaisons: [],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([]);
  });
});

describe("annotationsToMarks", () => {
  it("round-trips roles, liaisons and pauses", () => {
    const marks: MarkState = {
      roles: { 0: "core", 3: "core" },
      liaisons: [
        { start: { token: 1, offsets: [5] }, end: { token: 2, offsets: [0] } }
      ],
      pauses: { 2: 800 },
      passthrough: []
    };
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: marksToAnnotations(TEXT, marks)
    };
    expect(annotationsToMarks(value)).toEqual(marks);
  });

  it("界面已无入口的音标/高亮必须原样透传，不能静默丢弃", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [
        { type: "emphasis", start: 2, end: 8, level: "strong" },
        {
          type: "phoneme",
          start: 2,
          end: 8,
          alphabet: "ipa",
          phoneme: "ˈsentə"
        },
        { type: "highlight", start: 0, end: 1, color: "pink" }
      ]
    };
    const marks = annotationsToMarks(value);
    expect(marks.passthrough).toEqual([
      { type: "phoneme", start: 2, end: 8, alphabet: "ipa", phoneme: "ˈsentə" },
      { type: "highlight", start: 0, end: 1, color: "pink" }
    ]);
    // 往返一圈后两条注解仍在
    expect(marksToAnnotations(TEXT, marks)).toEqual(
      expect.arrayContaining(marks.passthrough)
    );
  });

  it("透传注解按改动段重挂，而不是一改文本就整批丢弃", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [],
      pauses: {},
      passthrough: [{ type: "highlight", start: 0, end: 1, color: "pink" }]
    };
    expect(remapMarks(TEXT, TEXT, marks).passthrough).toHaveLength(1);
    // 高亮标在首词 a 上，改的是末词：与它无关，必须留住
    expect(
      remapMarks(TEXT, "a centre of the town", marks).passthrough
    ).toHaveLength(1);
    // 改的正是首词本身，这条才该丢
    expect(remapMarks(TEXT, "X centre of the city", marks).passthrough).toEqual(
      []
    );
  });

  it("reads the legacy strong level back as the core role", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [{ type: "emphasis", start: 2, end: 8, level: "strong" }]
    };
    expect(annotationsToMarks(value).roles).toEqual({ 1: "core" });
  });

  it("assigns a hand-authored multi-word emphasis to every word it covers", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [{ type: "emphasis", start: 2, end: 11, level: "strong" }]
    };
    expect(annotationsToMarks(value).roles).toEqual({ 1: "core", 2: "core" });
  });

  it("多字母锚点存回 wire 后退化成两端单字母（契约限制，非缺陷）", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [
        // centre 的 "re" → of 的 "of"
        {
          start: { token: 1, offsets: [4, 5] },
          end: { token: 2, offsets: [0, 1] }
        }
      ],
      pauses: {},
      passthrough: []
    };
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: marksToAnnotations(TEXT, marks)
    };
    // wire 的 liaison 只有 {start,end} 两个数，装不下两个锚点各自的宽度。
    expect(value.annotations).toEqual([{ type: "liaison", start: 6, end: 11 }]);
    expect(annotationsToMarks(value).liaisons).toEqual([
      { start: { token: 1, offsets: [4] }, end: { token: 2, offsets: [1] } }
    ]);
  });

  it("端点落在空白上的历史连读直接丢弃，不硬凑锚点", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      // 1 与 8 都是空格位
      annotations: [{ type: "liaison", start: 1, end: 9 }]
    };
    expect(annotationsToMarks(value).liaisons).toEqual([]);
  });

  it("ignores annotations on blank text instead of throwing", () => {
    const value: RichTextV2 = {
      version: 2,
      text: "",
      annotations: [{ type: "pause", at: 0, duration_ms: 500 }]
    };
    expect(annotationsToMarks(value)).toEqual({
      roles: {},
      liaisons: [],
      pauses: {},
      passthrough: []
    });
  });
});

describe("remapMarks", () => {
  const liaison = {
    start: { token: 1, offsets: [5] },
    end: { token: 2, offsets: [0] }
  };

  it("keeps marks when the edit leaves earlier words untouched", () => {
    const marks: MarkState = {
      roles: { 0: "function", 1: "core" },
      liaisons: [liaison],
      pauses: { 0: 500 },
      passthrough: []
    };
    expect(remapMarks(TEXT, `${TEXT} centre`, marks)).toEqual(marks);
  });

  it("drops the mark on a word that was rewritten", () => {
    const marks: MarkState = {
      roles: { 0: "function", 1: "core" },
      liaisons: [],
      pauses: {},
      passthrough: []
    };
    expect(remapMarks(TEXT, "a middle of the city", marks).roles).toEqual({
      0: "function"
    });
  });

  it("改写连读任一端所在的词，整条连线消失", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [liaison],
      pauses: {},
      passthrough: []
    };
    expect(remapMarks(TEXT, "a middle of the city", marks).liaisons).toEqual(
      []
    );
    expect(remapMarks(TEXT, "a centre in the city", marks).liaisons).toEqual(
      []
    );
  });

  it("词被改短到锚点落空时也丢弃，避免连线挂在不存在的字母上", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [liaison],
      pauses: {},
      passthrough: []
    };
    // centre → cent，原锚点 offset 5 已越界
    expect(remapMarks(TEXT, "a cent of the city", marks).liaisons).toEqual([]);
  });

  it("drops gap marks when either neighbouring word changed", () => {
    const marks: MarkState = {
      roles: {},
      liaisons: [],
      pauses: { 0: 500, 3: 500 },
      passthrough: []
    };
    expect(remapMarks(TEXT, "a centre of the town", marks).pauses).toEqual({
      0: 500
    });
  });

  it("drops everything when the text is cleared", () => {
    const marks: MarkState = {
      roles: { 0: "core" },
      liaisons: [liaison],
      pauses: { 0: 500 },
      passthrough: []
    };
    expect(remapMarks(TEXT, "", marks)).toEqual({
      roles: {},
      liaisons: [],
      pauses: {},
      passthrough: []
    });
  });
});

describe("remapMarks 的透传注解", () => {
  const phoneme = (start: number, end: number) =>
    ({
      type: "phoneme",
      start,
      end,
      alphabet: "ipa",
      phoneme: "ˈsentə"
    }) as const;

  const withPassthrough = (annotations: RichTextAnnotation[]): MarkState => ({
    ...EMPTY_MARKS,
    passthrough: annotations
  });

  it("改动段之后的注解整体平移，之前的原样保留", () => {
    // "a centre of the city" → "a centre of the town"：只有最后一个词变了
    const marks = withPassthrough([phoneme(2, 8)]);
    const next = remapMarks(
      "a centre of the city",
      "a centre of the town",
      marks
    );
    expect(next.passthrough).toEqual([phoneme(2, 8)]);
  });

  it("在前面插字时，后面的注解跟着挪，不丢也不错位", () => {
    // 行首插 "the "：centre 的音标区间要整体 +4
    const marks = withPassthrough([phoneme(2, 8)]);
    const next = remapMarks("a centre of", "the a centre of", marks);
    expect(next.passthrough).toEqual([phoneme(6, 12)]);
  });

  it("只有压在改动段上的注解才丢弃", () => {
    // 改的正是 centre 这个词，它的音标已经指不到原来的音
    const marks = withPassthrough([phoneme(2, 8)]);
    const next = remapMarks("a centre of", "a center of", marks);
    expect(next.passthrough).toEqual([]);
  });

  it("改文本不再无差别清空透传注解", () => {
    // 回归：早先这里是「文本一变就整批丢」，随便敲一个字符音标就没了
    const marks = withPassthrough([phoneme(0, 1)]);
    const next = remapMarks("a centre", "a centre!", marks);
    expect(next.passthrough).toHaveLength(1);
  });
});

describe("graphemes", () => {
  it("组合字符与 ZWJ 序列各算一簇，偏移仍按码点", () => {
    // e + U+0301（组合尖音符）应合成一个字形，拆开渲染会多出一个字符
    expect(graphemes("cafe\u0301")).toEqual([
      { text: "c", offset: 0 },
      { text: "a", offset: 1 },
      { text: "f", offset: 2 },
      { text: "e\u0301", offset: 3 }
    ]);
  });

  it("多码点簇之后的偏移按码点数推进，与 tokenize 对齐", () => {
    const family = "👨\u200d👩\u200d👧";
    const parts = graphemes(`${family}x`);
    expect(parts).toHaveLength(2);
    // 该 ZWJ 序列占 5 个码点（3 个 emoji + 2 个 ZWJ），x 的偏移必须是 5
    expect(parts[1]).toEqual({ text: "x", offset: 5 });
    expect(Array.from(family)).toHaveLength(5);
  });

  it("渲染切分不改变字符本身，拼回去与原文一致", () => {
    for (const text of ["hello", "cafe\u0301", "👨\u200d👩\u200d👧 ok"]) {
      expect(
        graphemes(text)
          .map((part) => part.text)
          .join("")
      ).toBe(text);
    }
  });
});
