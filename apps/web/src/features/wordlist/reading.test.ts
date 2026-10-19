import { expect, it } from "vitest";
import type { WordlistDefinition } from "@tsz/types";
import { selectDefinition, selectTexts, phoneticDelimiters } from "./reading";
const def = (
  id: string,
  level: string,
  definition_mode: string
): WordlistDefinition => ({
  id,
  level,
  definition_mode,
  grammar_structure_id: `grammar-${id}`,
  texts: []
});
it("chooses definition level before language and never raises the reader level", () => {
  const lower = def("lower", "A1", "zh_definition"),
    exact = def("exact", "B1", "en_definition"),
    chinese = def("zh", "B1", "zh_sentence");
  expect(selectDefinition([lower, exact], "B1")).toBe(exact);
  expect(selectDefinition([exact, chinese], "B1")).toBe(chinese);
  expect(selectDefinition([lower, exact], "A2")).toBe(lower);
  expect(selectDefinition([exact], "A1")).toBeUndefined();
  expect(
    selectDefinition([chinese, def("other", "B1", "zh_definition")], "B1")
      ?.grammar_structure_id
  ).toBe("grammar-zh");
});

it("keeps real dialect variants and avoids duplicate phonetic delimiters", () => {
  const texts = [{ dialect: "uk" as const }, { dialect: "us" as const }];
  expect(selectTexts(texts, "BrE")).toEqual([texts[0]]);
  expect(selectTexts(texts, "AmE")).toEqual([texts[1]]);
  expect(selectTexts(texts, null)).toEqual(texts);
  expect(selectTexts([texts[0]!], "AmE")).toEqual([texts[0]]);
  expect(phoneticDelimiters("/riːd/")).toEqual(["", ""]);
  expect(phoneticDelimiters("[riːd]")).toEqual(["", ""]);
  expect(phoneticDelimiters("riːd")).toEqual(["/", "/"]);
});
