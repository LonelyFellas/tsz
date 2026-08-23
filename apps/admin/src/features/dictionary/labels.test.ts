import { describe, expect, it } from "vitest";
import {
  DIALECT_LABEL,
  FORM_TYPE_OPTIONS,
  shownDialects,
  toOptions
} from "./editorConstants";
import {
  CEFR_LEVELS,
  cefrColor,
  inboundRelationSummary,
  KIND_OPTIONS,
  relationTypeLabel,
  matchCategoryLabel,
  MATCH_CATEGORY_LABEL,
  STATUS_LABEL
} from "./labels";
import type { RelationReferenceSummaryV2 } from "@tsz/types";

describe("labels — wire 枚举 ↔ UI 标签", () => {
  it("kind/status 对照与 CEFR 全集", () => {
    expect(KIND_OPTIONS.map((o) => o.value)).toEqual(["word", "phrase"]);
    expect(STATUS_LABEL.draft).toBe("草稿");
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("cefrColor:六档等级使用独立色值", () => {
    expect(CEFR_LEVELS.map(cefrColor)).toEqual([
      "#4CCB4B",
      "#00A5CC",
      "#2053FF",
      "#7E2BF8",
      "#B817CF",
      "#D22D8D"
    ]);
  });
});

describe("editorConstants — 编辑器枚举", () => {
  it("shownDialects:选了方言按所选,否则回退 common", () => {
    expect(shownDialects(["uk", "us"])).toEqual(["uk", "us"]);
    expect(shownDialects([])).toEqual(["common"]);
  });

  it("固定方言与词形枚举的中文标签齐全", () => {
    expect(DIALECT_LABEL.common).toBe("默认");
    expect(DIALECT_LABEL.uk).toBe("英式英语");
    expect(DIALECT_LABEL.us).toBe("美式英语");
    expect(FORM_TYPE_OPTIONS).toContainEqual({ value: "base", label: "原形" });
  });

  it("toOptions:字符串数组转 label/value 对", () => {
    expect(toOptions(["A1"])).toEqual([{ label: "A1", value: "A1" }]);
  });
});

describe("matchCategoryLabel — 命中原因", () => {
  it("五类都有中文文案，且不重复", () => {
    const labels = Object.values(MATCH_CATEGORY_LABEL);
    expect(labels).toHaveLength(5);
    expect(new Set(labels).size).toBe(5);
  });

  it("form_headword 与 headword_form 方向相反，文案不能雷同", () => {
    expect(MATCH_CATEGORY_LABEL.form_headword).not.toBe(
      MATCH_CATEGORY_LABEL.headword_form
    );
  });

  it("白名单外的码原样透出，不吞掉", () => {
    // 后端可能先于前端上线新类别；静默丢弃会让人误以为「没有命中原因」
    expect(matchCategoryLabel("brand_new_category" as never)).toBe(
      "brand_new_category"
    );
  });
});

describe("inboundRelationSummary — 被哪些词条引用", () => {
  const summary = (
    overrides: Partial<RelationReferenceSummaryV2> = {}
  ): RelationReferenceSummaryV2 => ({
    total: 0,
    by_type: { synonym: 0, antonym: 0, derivative: 0 },
    previews: [],
    truncated: false,
    ...overrides
  });
  const preview = (
    headword: string,
    relation: "synonym" | "antonym" | "derivative"
  ) => ({
    source_word_id: `word-${headword}`,
    source_headword: headword,
    relation
  });

  it("没有引用时不出这一项", () => {
    expect(inboundRelationSummary(summary())).toBeUndefined();
    expect(inboundRelationSummary(undefined)).toBeUndefined();
  });

  it("total 与样本不同步时按多条处理，不写具体类型", () => {
    // total 说 1 但给了两条样本：宁可只报数量，也不要挑一条当成全部
    expect(
      inboundRelationSummary(
        summary({
          total: 1,
          by_type: { synonym: 1, antonym: 0, derivative: 0 },
          previews: [preview("clear", "synonym"), preview("high", "antonym")]
        })
      )
    ).toBe("clear 等 1 个词条");
  });

  it("恰好一条时写出具体来源与类型", () => {
    expect(
      inboundRelationSummary(
        summary({
          total: 1,
          by_type: { synonym: 1, antonym: 0, derivative: 0 },
          previews: [preview("clear", "synonym")]
        })
      )
    ).toBe("clear 的同义词");
    expect(
      inboundRelationSummary(
        summary({
          total: 1,
          by_type: { synonym: 0, antonym: 1, derivative: 0 },
          previews: [preview("high", "antonym")]
        })
      )
    ).toBe("high 的反义词");
  });

  it("多条时只报数量不报类型——previews 被后端截到 5 条，写类型会以偏概全", () => {
    expect(
      inboundRelationSummary(
        summary({
          total: 9,
          by_type: { synonym: 3, antonym: 3, derivative: 3 },
          previews: [preview("high", "antonym"), preview("record", "synonym")],
          truncated: true
        })
      )
    ).toBe("high 等 9 个词条");
  });

  it("有计数但样本为空时仍报得出数量", () => {
    expect(
      inboundRelationSummary(
        summary({
          total: 4,
          by_type: { synonym: 4, antonym: 0, derivative: 0 }
        })
      )
    ).toBe("4 个词条");
  });
});

describe("relationTypeLabel — 关联类型", () => {
  it("三种类型都带「词」字", () => {
    expect(relationTypeLabel("synonym")).toBe("同义词");
    expect(relationTypeLabel("antonym")).toBe("反义词");
    expect(relationTypeLabel("derivative")).toBe("派生词");
  });

  it("未知类型原样透出，不渲染成 undefined", () => {
    // wire 先于前端新增取值时，「clear 的undefined」是会直接给用户看到的
    expect(relationTypeLabel("hypernym" as never)).toBe("hypernym");
  });
});
