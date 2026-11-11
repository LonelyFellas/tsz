import { describe, expect, it } from "vitest";
import type { NextDraft } from "@tsz/types";
import { previewDraft, draftProblem } from "./model";
describe("本地草稿预览", () => {
  it("只回退显式通用英语，绝不跨英美或简繁补齐，不改变原稿", () => {
    const draft: NextDraft = {
      schema_version: 1,
      headword: "centre",
      forms: [
        { id: "common", locale: "en", text: "shared" },
        { id: "us", locale: "en-US", text: "center" }
      ],
      senses: [
        {
          id: "sense",
          part_of_speech: null,
          definitions: [
            { id: "def", locale: "en-US", text: "middle", style: "definition" }
          ],
          equivalents: [{ id: "eq", locale: "zh-Hans", text: "中心" }]
        }
      ]
    };
    const original = structuredClone(draft);
    const gb = previewDraft(draft, "en-GB", "zh-Hant");
    expect(gb.forms).toEqual([draft.forms[0]]);
    expect(gb.senses[0]?.missing_target_definitions).toBe(true);
    expect(gb.senses[0]?.missing_equivalents).toBe(true);
    const us = previewDraft(draft, "en-US", "zh-Hans");
    expect(us.forms).toEqual([draft.forms[1]]);
    expect(us.senses[0]?.equivalents).toEqual(draft.senses[0]?.equivalents);
    expect(draft).toEqual(original);
  });
  it("Unicode 码点限长与空行校验覆盖隐藏语言", () => {
    const draft: NextDraft = {
      schema_version: 1,
      headword: "𠮷".repeat(200),
      forms: [{ id: "hidden", locale: "en-US", text: " " }],
      senses: []
    };
    expect(draftProblem(draft)).toContain("美式英语词形");
    draft.forms = [];
    expect(draftProblem(draft)).toBeNull();
    draft.headword += "a";
    expect(draftProblem(draft)).toContain("词头");
  });
});
