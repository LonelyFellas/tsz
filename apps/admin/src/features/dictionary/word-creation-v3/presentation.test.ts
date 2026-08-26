import { describe, expect, it } from "vitest";
import {
  definitionModeLabel,
  dialectLabel,
  formTypeLabel,
  impactReasonLabel,
  impactTypeLabel,
  partOfSpeechLabel,
  pronunciationStyleLabel,
  publicationBlockMessage,
  relationLabel,
  sentenceLinkRoleLabel,
  subPartOfSpeechLabel,
  wordStatusLabel
} from "./presentation";

describe("V3 product presentation", () => {
  it("集中映射词条、词形、地区与发音业务标签", () => {
    expect(wordStatusLabel("published")).toBe("已发布");
    expect(formTypeLabel("base")).toBe("原形");
    expect(formTypeLabel("past_participle")).toBe("过去分词");
    expect(dialectLabel("common")).toBe("通用");
    expect(pronunciationStyleLabel("weak")).toBe("弱读");
    expect(partOfSpeechLabel("noun")).toBe("名词");
    expect(partOfSpeechLabel("future-pos")).toBe("其他词性");
    expect(subPartOfSpeechLabel("N-COUNT")).toBe("可数名词");
    expect(subPartOfSpeechLabel("future-sub-pos")).toBe("其他细分词性");
    expect(relationLabel("synonym")).toBe("近义词");
    expect(relationLabel("future-relation")).toBe("其他关系");
    expect(sentenceLinkRoleLabel("focus")).toBe("主关联");
    expect(sentenceLinkRoleLabel("context")).toBe("上下文关联");
    expect(sentenceLinkRoleLabel("future-role")).toBe("其他关联");
  });

  it("映射影响、定义与发布阻断，不返回原始代码", () => {
    expect(impactTypeLabel("membership")).toBe("词形使用位置");
    expect(impactReasonLabel("例句仍引用词形")).toBe("例句仍引用词形");
    expect(impactReasonLabel("referenced")).toBe(
      "关联内容将随本次调整受到影响。"
    );
    expect(definitionModeLabel("en_sentence")).toBe("英文例句");
    expect(publicationBlockMessage("phase2_consumers_not_ready")).not.toContain(
      "phase2_consumers_not_ready"
    );
  });

  it("未知枚举统一回退到产品文案", () => {
    expect(formTypeLabel("future-form" as never)).toBe("未识别词形类型");
    expect(dialectLabel("future-dialect" as never)).toBe("未识别地区");
    expect(pronunciationStyleLabel("future-style" as never)).toBe(
      "未识别发音方式"
    );
    expect(impactTypeLabel("future-impact" as never)).toBe("受影响内容");
    expect(definitionModeLabel("future-definition" as never)).toBe(
      "未识别内容方式"
    );
  });
});
