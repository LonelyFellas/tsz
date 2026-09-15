import { describe, expect, it } from "vitest";
import type { TextLinkV3 } from "@tsz/types";
import {
  associationWords,
  rangesOverlap,
  remapTextLinks,
  remapTextLinksWithRecovery,
  wordSegments
} from "./text-links";

const link = (start: number, end: number, surface: string): TextLinkV3 => ({
  id: "link",
  source_segments: [{ start, end, surface }],
  target_word_id: "word",
  target_publication_id: "pub",
  target_pos_id: "pos",
  target_base_form_id: "base",
  target_form_id: "form",
  target_variant_id: "variant",
  target_sense_id: "sense"
});

describe("正文关联区间", () => {
  it("重复词按位置平移，emoji 使用码点", () => {
    const selected = link(7, 13, "mother");
    expect(
      remapTextLinks("mother mother", "👩 mother mother", [selected])[0]
        ?.source_segments
    ).toEqual([{ start: 9, end: 15, surface: "mother" }]);
    expect(
      remapTextLinks("mother mother", "father mother", [selected])[0]
        ?.source_segments
    ).toEqual(selected.source_segments);
  });
  it("改写关联词或在边界把它接成新词时清除，不移植到同名词", () => {
    const selected = link(0, 6, "mother");
    expect(
      remapTextLinks("mother mother", "mothers mother", [selected])
    ).toEqual([]);
    expect(remapTextLinks("mother mother", "mother", [selected])).toEqual([
      selected
    ]);
    expect(
      remapTextLinks("mother mother", "father mother", [selected])
    ).toEqual([]);
  });
  it("连续词合段，可分离短语保留中间未选词", () => {
    const text = "dress me up";
    const segments = wordSegments(text, [
      { start: 9, end: 11 },
      { start: 0, end: 5 }
    ]);
    expect(segments).toEqual([
      { start: 0, end: 5, surface: "dress" },
      { start: 9, end: 11, surface: "up" }
    ]);
    expect(rangesOverlap(segments, [{ start: 6, end: 8, surface: "me" }])).toBe(
      false
    );
    expect(
      wordSegments(text, [
        { start: 0, end: 5 },
        { start: 6, end: 8 }
      ])
    ).toEqual([{ start: 0, end: 8, surface: "dress me" }]);
  });
});

it("关联切词排除句尾标点，逗号两侧独立且保留词内连接符", () => {
  expect(associationWords("👩 Mother,don't dress-up!")).toEqual([
    { start: 2, end: 8, surface: "Mother" },
    { start: 9, end: 14, surface: "don't" },
    { start: 15, end: 23, surface: "dress-up" }
  ]);
});

it("打错时不保留无效关联，原文还原后恢复原 ID，不移植到其他重复词", () => {
  const original = link(0, 4, "make");
  const changed = remapTextLinksWithRecovery(
    "make make",
    "makke make",
    [original],
    []
  );
  expect(changed.links).toEqual([]);
  expect(changed.recoverable).toHaveLength(1);
  const replaced = remapTextLinksWithRecovery(
    "makke make",
    "make",
    changed.links,
    changed.recoverable
  );
  expect(replaced.links).toEqual([]);
  const restored = remapTextLinksWithRecovery(
    "makke make",
    "make make",
    changed.links,
    changed.recoverable
  );
  expect(restored.links).toEqual([original]);
  expect(restored.recoverable).toEqual([]);
});

it("原位置已有新的关联时不覆盖或重复恢复", () => {
  const original = link(0, 4, "make");
  const changed = remapTextLinksWithRecovery(
    "make make",
    "makke make",
    [original],
    []
  );
  const replacement = {
    ...original,
    id: "replacement",
    target_word_id: "another-entry"
  };
  const result = remapTextLinksWithRecovery(
    "make make",
    "make make",
    [replacement],
    changed.recoverable
  );
  expect(result.links).toEqual([replacement]);
});

it.each([
  {
    name: "单词改写",
    before: "for a job",
    after: "to a job",
    surface: "for",
    keep: false
  },
  {
    name: "单词删除",
    before: "for a job",
    after: "a job",
    surface: "for",
    keep: false
  },
  {
    name: "单词拼接成新词",
    before: "for a job",
    after: "forever a job",
    surface: "for",
    keep: false
  },
  {
    name: "关联外修改",
    before: "for a job",
    after: "for a career",
    surface: "for",
    keep: true
  },
  {
    name: "单词前插入 emoji",
    before: "for a job",
    after: "👩 for a job",
    surface: "for",
    keep: true
  },
  {
    name: "单词旁加标点",
    before: "for a job",
    after: "for, a job",
    surface: "for",
    keep: true
  },
  {
    name: "短语改写组成词",
    before: "look for a job",
    after: "look at a job",
    surface: "look for",
    keep: false
  },
  {
    name: "短语删除组成词",
    before: "look for a job",
    after: "look a job",
    surface: "look for",
    keep: false
  },
  {
    name: "短语插入新词",
    before: "look for a job",
    after: "look hard for a job",
    surface: "look for",
    keep: false
  },
  {
    name: "短语只增加空格",
    before: "look for a job",
    after: "look  for a job",
    surface: "look for",
    keep: true
  },
  {
    name: "短语合并为一个词",
    before: "look for a job",
    after: "lookfor a job",
    surface: "look for",
    keep: false
  },
  {
    name: "短语末尾标点",
    before: "look for",
    after: "look for!",
    surface: "look for",
    keep: true
  }
])("$name：只保留仍准确匹配的关联", ({ before, after, surface, keep }) => {
  const original = link(0, surface.length, surface);
  const result = remapTextLinksWithRecovery(before, after, [original], []);
  expect(result.links).toHaveLength(keep ? 1 : 0);
  if (keep) {
    expect(result.recoverable).toEqual([]);
    expect(result.links[0]).toMatchObject({
      id: original.id,
      target_word_id: original.target_word_id
    });
    const segment = result.links[0]!.source_segments[0]!;
    expect(Array.from(after).slice(segment.start, segment.end).join("")).toBe(
      segment.surface
    );
  } else {
    expect(result.recoverable).toHaveLength(1);
    expect(
      remapTextLinksWithRecovery(
        after,
        before,
        result.links,
        result.recoverable
      ).links
    ).toEqual([original]);
  }
});

it("非连续短语只改间隔词时平移，改任一组成词时整条解除，其他单词关联不受影响", () => {
  const phrase = {
    ...link(0, 4, "look"),
    id: "phrase",
    source_segments: [
      { start: 0, end: 4, surface: "look" },
      { start: 8, end: 10, surface: "up" }
    ]
  };
  const word = { ...link(5, 7, "it"), id: "word" };
  expect(remapTextLinks("look it up", "look this up", [phrase, word])).toEqual([
    {
      ...phrase,
      source_segments: [
        { start: 0, end: 4, surface: "look" },
        { start: 10, end: 12, surface: "up" }
      ]
    }
  ]);
  expect(remapTextLinks("look it up", "take it up", [phrase, word])).toEqual([
    word
  ]);
});
