import { describe, expect, it } from "vitest";
import type { WordRelationWritableV3 } from "@tsz/types";
import {
  groupRelations,
  replaceRelationGroup,
  selectDerivativeSenses
} from "./relationGroups";

const relation = (id: string, sense: string): WordRelationWritableV3 => ({
  id,
  relation: "derivative",
  target_word_id: "target",
  target_sense_id: sense,
  score: "80"
});

describe("派生词展示分组", () => {
  it("同目标不同义项合组，近义词与文本不合并且保留顺序", () => {
    const first = relation("r1", "s1");
    const synonym = { ...relation("r2", "s1"), relation: "synonym" };
    const second = relation("r3", "s2");
    const text = {
      id: "text",
      relation: "derivative",
      pending_target_headword: "target",
      score: "0"
    };
    expect(groupRelations([first, synonym, second, text])).toEqual([
      [first, second],
      [synonym],
      [text]
    ]);
  });
  it("手动派生词按规范词面合组，空词面、已关联词和近义词不混合", () => {
    const first = {
      id: "a",
      relation: "derivative",
      pending_target_headword: " outside ",
      pending_target_gloss: "一",
      score: "50"
    };
    const second = {
      ...first,
      id: "b",
      pending_target_headword: "Outside",
      pending_target_gloss: "二"
    };
    const synonym = { ...second, id: "c", relation: "synonym" };
    const empty = { ...first, id: "d", pending_target_headword: "" };
    const bound = relation("e", "s1");
    expect(groupRelations([first, synonym, second, empty, bound])).toEqual([
      [first, second],
      [synonym],
      [empty],
      [bound]
    ]);
  });
  it.each(["synonym", "antonym", "derivative"])(
    "手动 %s 的多个词义合组且不混合关系类型",
    (type) => {
      const first = {
        id: "a",
        relation: type,
        pending_target_headword: "outside",
        pending_target_gloss: "一",
        score: "50"
      };
      const second = { ...first, id: "b", pending_target_gloss: "二" };
      const other = {
        ...first,
        id: "c",
        relation: type === "synonym" ? "antonym" : "synonym"
      };
      expect(groupRelations([first, other, second])).toEqual([
        [first, second],
        [other]
      ]);
    }
  );
  it("取消与新增保留未变义项 UUID，清空仍保留可编辑行，删除整组不碰其他关系", () => {
    const first = relation("r1", "s1");
    const second = relation("r2", "s2");
    const other = { ...relation("other", "s3"), target_word_id: "other" };
    const selected = selectDerivativeSenses(
      [first, second],
      ["s2", "s3"],
      () => "new"
    );
    expect(selected).toEqual([second, relation("new", "s3")]);
    expect(
      replaceRelationGroup([first, other, second], [first, second], selected)
    ).toEqual([...selected, other]);
    expect(selectDerivativeSenses([first, second], [], () => "unused")).toEqual(
      [
        {
          id: "r1",
          relation: "derivative",
          target_word_id: "target",
          score: "80"
        }
      ]
    );
    expect(
      replaceRelationGroup([first, other, second], [first, second], [])
    ).toEqual([other]);
  });
});
