import { describe, expect, it } from "vitest";
import type { WordlistDefinition, WordlistEntry } from "@tsz/types";
import { dictionaryDefinition, dictionarySpellings } from "./reading";
const definition = (
  level: string,
  mode = "zh_definition"
): WordlistDefinition => ({
  id: `${level}:${mode}`,
  level,
  definition_mode: mode,
  grammar_structure_id: null,
  texts: []
});
describe("词典展示选择", () => {
  it("等级最近，同距先较低等级，同等级中文优先", () => {
    const choices = [
      definition("C2"),
      definition("B2"),
      definition("A2", "en_definition"),
      definition("A2"),
      definition("A1")
    ];
    expect(dictionaryDefinition(choices, "B1")?.id).toBe("A2:zh_definition");
    expect(
      dictionaryDefinition(
        [...choices, definition("B1", "en_definition")],
        "B1"
      )?.id
    ).toBe("B1:en_definition");
    expect(dictionaryDefinition([definition("C1")], "A1")?.level).toBe("C1");
    expect(dictionaryDefinition([], "B1")).toBeUndefined();
  });
  it("按方言选择主拼写，其它拼写去重", () => {
    const entry = {
      label: "centre",
      pos: [
        {
          forms: [
            {
              form_type: "base",
              variants: [
                { spelling: "centre", dialect: "uk" },
                { spelling: "center", dialect: "us" }
              ]
            }
          ]
        }
      ]
    } as WordlistEntry;
    expect(dictionarySpellings(entry, "AmE")).toEqual({
      primary: "center",
      alternate: "centre"
    });
    expect(dictionarySpellings(entry, "BrE")).toEqual({
      primary: "centre",
      alternate: "center"
    });
  });
});
