import { describe, expect, it } from "vitest";
import type { RichTextAnnotation, RichTextV2 } from "@tsz/types";
import {
  EMPTY_MARKS,
  anchorLetters,
  graphemes,
  anchorRange,
  annotationsToMarks,
  applyRoleRange,
  splitRangeAtParagraphs,
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
      roles: [{ start: 2, end: 8, level: "core" }],
      liaisons: [],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "core" }
    ]);
  });

  it("连读落成从起点字母到终点字母的区间", () => {
    const marks: MarkState = {
      roles: [],
      liaisons: [
        // centre 的 e(末字母, offset 5) → of 的 o(offset 0)
        { start: { token: 1, offsets: [5] }, end: { token: 2, offsets: [0] } }
      ],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      {
        type: "liaison",
        start: 7,
        end: 10,
        start_len: 1,
        end_len: 1
      }
    ]);
  });

  it("连读可以跨越任意距离，不限于相邻词", () => {
    const marks: MarkState = {
      roles: [],
      liaisons: [
        { start: { token: 0, offsets: [0] }, end: { token: 4, offsets: [3] } }
      ],
      pauses: {},
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      {
        type: "liaison",
        start: 0,
        end: 20,
        start_len: 1,
        end_len: 1
      }
    ]);
  });

  it("锚点越界的连读整条丢弃，不落半条线", () => {
    const marks: MarkState = {
      roles: [],
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
      roles: [],
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
      roles: [],
      liaisons: [],
      pauses: { 4: 500, 9: 500 },
      passthrough: []
    };
    expect(marksToAnnotations(TEXT, marks)).toEqual([]);
  });

  it("drops role marks pointing past the last word", () => {
    const marks: MarkState = {
      roles: [{ start: 30, end: 33, level: "core" }],
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
      roles: [
        { start: 0, end: 1, level: "core" },
        { start: 12, end: 15, level: "core" }
      ],
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
        { type: "emphasis", start: 2, end: 8, level: "core" },
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
      roles: [],
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
      annotations: [{ type: "emphasis", start: 2, end: 8, level: "core" }]
    };
    expect(annotationsToMarks(value).roles).toEqual([
      { start: 2, end: 8, level: "core" }
    ]);
  });

  it("reads a multi-word emphasis as one unit spanning every word it touches", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [{ type: "emphasis", start: 2, end: 11, level: "core" }]
    };
    expect(annotationsToMarks(value).roles).toEqual([
      { start: 2, end: 11, level: "core" }
    ]);
  });

  it("writes a unit back as one emphasis covering the phrase, spaces included", () => {
    const marks: MarkState = {
      roles: [{ start: 2, end: 15, level: "function" }],
      liaisons: [],
      pauses: {},
      passthrough: []
    };
    // centre(2-8) of(9-11) the(12-15) → 一条 [2,15)
    expect(marksToAnnotations(TEXT, marks)).toEqual([
      { type: "emphasis", start: 2, end: 15, level: "function" }
    ]);
    expect(
      annotationsToMarks({
        version: 2,
        text: TEXT,
        annotations: marksToAnnotations(TEXT, marks)
      }).roles
    ).toEqual(marks.roles);
  });

  it("多字母锚点带宽度往返，不再退化成两端单字母", () => {
    // 后端为 liaison 加了 start_len / end_len 之后，两端各自的宽度存得下了
    const marks: MarkState = {
      roles: [],
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
    expect(value.annotations).toEqual([
      { type: "liaison", start: 6, end: 11, start_len: 2, end_len: 2 }
    ]);
    expect(annotationsToMarks(value).liaisons).toEqual(marks.liaisons);
  });

  it("没有宽度字段的存量连读按两端各一个字母读回", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [
        {
          type: "liaison",
          start: 6,
          end: 11,
          start_len: 1,
          end_len: 1
        }
      ]
    };
    expect(annotationsToMarks(value).liaisons).toEqual([
      { start: { token: 1, offsets: [4] }, end: { token: 2, offsets: [1] } }
    ]);
  });

  it("宽度越过词边界时退回单字母，不把弧画到别的词上", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      // centre 只到偏移 8，start_len=5 会越界
      annotations: [
        { type: "liaison", start: 6, end: 11, start_len: 5, end_len: 1 }
      ]
    };
    const [link] = annotationsToMarks(value).liaisons;
    expect(link!.start.offsets).toEqual([4]);
  });

  it("端点落在空白上的历史连读直接丢弃，不硬凑锚点", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      // 1 与 8 都是空格位
      annotations: [
        {
          type: "liaison",
          start: 1,
          end: 9,
          start_len: 1,
          end_len: 1
        }
      ]
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
      roles: [],
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
      roles: [
        { start: 0, end: 1, level: "function" },
        { start: 2, end: 8, level: "core" }
      ],
      liaisons: [liaison],
      pauses: { 0: 500 },
      passthrough: []
    };
    expect(remapMarks(TEXT, `${TEXT} centre`, marks)).toEqual(marks);
  });

  it("drops the mark on a word that was rewritten", () => {
    const marks: MarkState = {
      roles: [
        { start: 0, end: 1, level: "function" },
        { start: 2, end: 8, level: "core" }
      ],
      liaisons: [],
      pauses: {},
      passthrough: []
    };
    expect(remapMarks(TEXT, "a middle of the city", marks).roles).toEqual([
      { start: 0, end: 1, level: "function" }
    ]);
  });

  it("改写单元中间的词：那个词退出单元，两侧各自留成单元", () => {
    // a centre of the city 全句一个核心词单元，改掉 of
    const marks: MarkState = {
      roles: [{ start: 0, end: 20, level: "core" }],
      liaisons: [],
      pauses: {},
      passthrough: []
    };
    expect(remapMarks(TEXT, "a centre in the city", marks).roles).toEqual([
      { start: 0, end: 8, level: "core" },
      { start: 12, end: 20, level: "core" }
    ]);
  });

  it("改写连读任一端所在的词，整条连线消失", () => {
    const marks: MarkState = {
      roles: [],
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
      roles: [],
      liaisons: [liaison],
      pauses: {},
      passthrough: []
    };
    // centre → cent，原锚点 offset 5 已越界
    expect(remapMarks(TEXT, "a cent of the city", marks).liaisons).toEqual([]);
  });

  it("drops gap marks when either neighbouring word changed", () => {
    const marks: MarkState = {
      roles: [],
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
      roles: [{ start: 0, end: 1, level: "core" }],
      liaisons: [liaison],
      pauses: { 0: 500 },
      passthrough: []
    };
    expect(remapMarks(TEXT, "", marks)).toEqual({
      roles: [],
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

describe("applyRoleRange", () => {
  const core = (start: number, end: number) => ({ start, end, level: "core" });

  it("paints letter by letter and coalesces touching same-level ranges", () => {
    let units = applyRoleRange(TEXT, [], core(2, 3));
    units = applyRoleRange(TEXT, units, core(3, 4));
    units = applyRoleRange(TEXT, units, core(4, 5));
    expect(units).toEqual([core(2, 5)]);
  });

  it("painting a range already fully in that level removes those letters (splitting the unit)", () => {
    expect(applyRoleRange(TEXT, [core(2, 8)], core(4, 6))).toEqual([
      core(2, 4),
      core(6, 8)
    ]);
    expect(applyRoleRange(TEXT, [core(2, 8)], core(2, 8))).toEqual([]);
  });

  it("a different level recolours the overlap and leaves the rest of the old unit", () => {
    expect(
      applyRoleRange(TEXT, [core(2, 8)], { start: 5, end: 8, level: "grammar" })
    ).toEqual([core(2, 5), { start: 5, end: 8, level: "grammar" }]);
  });

  it("a mixed range is unified to the brush level, not toggled off", () => {
    const units = [core(2, 4), { start: 4, end: 6, level: "grammar" }];
    expect(applyRoleRange(TEXT, units, core(2, 6))).toEqual([core(2, 6)]);
  });

  it("with toggle off, repainting an already-painted range keeps it (used to bridge two clicks)", () => {
    expect(
      applyRoleRange(TEXT, [core(2, 3), core(7, 8)], core(2, 8), {
        toggle: false
      })
    ).toEqual([core(2, 8)]);
    expect(
      applyRoleRange(TEXT, [core(2, 8)], core(3, 5), { toggle: false })
    ).toEqual([core(2, 8)]);
  });

  it("drops the whitespace a toggle-off leaves at a unit's edge, and whitespace-only leftovers", () => {
    // "centre of"(2-11) 上色后逐字母撤掉 "of"：残段不能拖着尾部空格，只剩空格的更要消失
    const painted = applyRoleRange(TEXT, [], core(2, 11));
    const withoutOf = applyRoleRange(TEXT, painted, core(9, 11));
    expect(withoutOf).toEqual([core(2, 8)]);
    // [2,9) 带着尾部空格，撤掉 centre 后只剩那个空格的单元要整个消失
    expect(applyRoleRange(TEXT, [core(2, 9)], core(2, 8))).toEqual([]);
  });

  it("ignores empty ranges", () => {
    expect(applyRoleRange(TEXT, [core(2, 8)], core(3, 3))).toEqual([
      core(2, 8)
    ]);
  });
});

describe("splitRangeAtParagraphs", () => {
  it("splits a range at line breaks and never yields empty pieces", () => {
    const text = "a centre\nof the\ncity";
    expect(splitRangeAtParagraphs(text, 2, 12)).toEqual([
      { start: 2, end: 8 },
      { start: 9, end: 12 }
    ]);
    expect(splitRangeAtParagraphs(text, 8, 9)).toEqual([]);
    expect(splitRangeAtParagraphs(text, 0, 1)).toEqual([{ start: 0, end: 1 }]);
  });
});

describe("annotationsToMarks 与 emphasis 重叠", () => {
  it("不同分类的重叠 emphasis 按后者覆盖前者收成互不重叠的单元", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [
        { type: "emphasis", start: 2, end: 8, level: "core" },
        { type: "emphasis", start: 4, end: 11, level: "grammar" }
      ]
    };
    expect(annotationsToMarks(value).roles).toEqual([
      { start: 2, end: 4, level: "core" },
      { start: 4, end: 11, level: "grammar" }
    ]);
  });
});
