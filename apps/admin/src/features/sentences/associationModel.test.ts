import type { SentenceTarget } from "@tsz/types";
import { sentenceTarget, sentenceWord } from "./fixtures";
import { describe, expect, it } from "vitest";
import {
  currentSentenceCandidates,
  matchesSentenceTarget,
  sameSentenceTarget,
  savedSenseTargets
} from "./associationModel";
const phrase = {
  id: "entry",
  kind: "phrase",
  headword: "make up",
  surfaces: [
    { surface: "make up", dialect: "uk" },
    { surface: "made up", dialect: "uk" }
  ]
};
describe("当前词条关联的即时检查", () => {
  it("完整单词及登记变形可通过，子串、未登记变形、跨句和错误方言不可通过", () => {
    expect(
      matchesSentenceTarget(
        "We made the story up.",
        [
          { start: 3, end: 7, surface: "made" },
          { start: 18, end: 20, surface: "up" }
        ],
        "common",
        phrase
      )
    ).toBe(true);
    expect(
      matchesSentenceTarget(
        "We maker the story up.",
        [
          { start: 3, end: 7, surface: "make" },
          { start: 19, end: 21, surface: "up" }
        ],
        "common",
        phrase
      )
    ).toBe(false);
    expect(
      matchesSentenceTarget(
        "making up",
        [{ start: 0, end: 9, surface: "making up" }],
        "common",
        phrase
      )
    ).toBe(false);
    expect(
      matchesSentenceTarget(
        "make. up",
        [
          { start: 0, end: 4, surface: "make" },
          { start: 6, end: 8, surface: "up" }
        ],
        "common",
        phrase
      )
    ).toBe(false);
    expect(
      matchesSentenceTarget(
        "made up",
        [{ start: 0, end: 7, surface: "made up" }],
        "us",
        phrase
      )
    ).toBe(false);
  });
  it("重复出现时返回可区分位置，不重复提供已被其他关联占用的片段", () => {
    const target = {
      ...phrase,
      kind: "word",
      headword: "make",
      surfaces: [{ surface: "make", dialect: "uk" }]
    };
    const candidates = currentSentenceCandidates(
      "make make maker",
      "common",
      target,
      []
    );
    expect(candidates).toEqual([
      [{ start: 0, end: 4, surface: "make" }],
      [{ start: 5, end: 9, surface: "make" }]
    ]);
    expect(
      currentSentenceCandidates("make make maker", "common", target, [
        {
          id: "a",
          source_dialect: "common",
          source_segments: candidates[0]!,
          target: sentenceTarget("other")
        }
      ])
    ).toEqual([candidates[1]]);
  });
});

it("快捷关联按组与成员顺序去重，调序不改变候选身份且保留未入组历史词形", () => {
  const word = sentenceWord();
  const pos = word.forms.pos[0]!;
  const base = pos.forms[0]!;
  pos.forms.push(
    { ...base, id: "past", form_type: "past_tense" },
    { ...base, id: "second-only", form_type: "past_participle" },
    { ...base, id: "historical-base" }
  );
  pos.form_groups = ["first", "second"].map((id) => ({
    id,
    is_regular: true,
    scope: "general",
    dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
    members: (id === "first"
      ? ["base", "past"]
      : ["base", "second-only", "past"]
    ).map((form_id) => ({
      id: `${id}-${form_id}`,
      form_id
    }))
  }));
  const before = savedSenseTargets(word, "sense");
  expect(before.map((item) => item.target.target_form_id)).toEqual([
    "base",
    "past",
    "second-only",
    "historical-base"
  ]);
  pos.form_groups[0]!.members.reverse();
  const after = savedSenseTargets(word, "sense");
  expect(after).toEqual([before[1], before[0], before[2], before[3]]);
  pos.form_groups.reverse();
  expect(savedSenseTargets(word, "sense")).toEqual([
    before[0],
    before[2],
    before[1],
    before[3]
  ]);
  expect(pos.forms.map((form) => form.id)).toEqual([
    "base",
    "past",
    "second-only",
    "historical-base"
  ]);
  expect(savedSenseTargets(word, "missing-sense")).toEqual([]);
});

type Linked = Extract<SentenceTarget, { state: "linked" }>;

function linkedTarget(overrides: Partial<Linked> = {}): Linked {
  return {
    state: "linked",
    target_entry_id: "entry",
    target_pos_id: "pos",
    target_base_form_id: "base",
    target_form_id: "form",
    target_variant_id: "variant",
    target_sense_id: "sense",
    ...overrides
  };
}

describe("sameSentenceTarget：结构漂移后的认领口径", () => {
  it("实例 id 相同即同一引用", () => {
    expect(sameSentenceTarget(linkedTarget(), linkedTarget())).toBe(true);
  });

  it("结构漂移换了实例 id：按 target_dialect 重新认领（TASK#58 解锁后的常态路径）", () => {
    const stored = linkedTarget({
      target_variant_id: "variant-old",
      target_dialect: "uk"
    });
    const current = linkedTarget({
      target_variant_id: "variant-new",
      target_dialect: "uk"
    });
    expect(sameSentenceTarget(stored, current)).toBe(true);
    // 侧别不同不是同一引用。
    expect(
      sameSentenceTarget(
        stored,
        linkedTarget({ target_variant_id: "variant-us", target_dialect: "us" })
      )
    ).toBe(false);
  });

  it("common 引用可落到任一侧（与后端 shared_target_matches 同口径）", () => {
    const common = linkedTarget({
      target_variant_id: "variant-common",
      target_dialect: "common"
    });
    expect(
      sameSentenceTarget(
        common,
        linkedTarget({ target_variant_id: "variant-uk", target_dialect: "uk" })
      )
    ).toBe(true);
  });

  it("存量引用缺 target_dialect：用调用方传的 source_dialect 兜底", () => {
    const legacy = linkedTarget({ target_variant_id: "variant-old" });
    const current = linkedTarget({
      target_variant_id: "variant-uk",
      target_dialect: "uk"
    });
    expect(sameSentenceTarget(legacy, current, "uk")).toBe(true);
    expect(sameSentenceTarget(legacy, current, "us")).toBe(false);
    // 两边都拿不到方言时只有实例 id 相等才算。
    expect(sameSentenceTarget(legacy, current)).toBe(false);
  });

  it("词形 / 词义 / 原形不同一律不算同一引用", () => {
    expect(
      sameSentenceTarget(linkedTarget(), linkedTarget({ target_form_id: "x" }))
    ).toBe(false);
    expect(
      sameSentenceTarget(linkedTarget(), linkedTarget({ target_sense_id: "x" }))
    ).toBe(false);
    expect(
      sameSentenceTarget(
        linkedTarget(),
        linkedTarget({ target_base_form_id: "x" })
      )
    ).toBe(false);
  });
});
