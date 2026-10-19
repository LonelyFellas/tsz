import type {
  CEFRLevel,
  EnglishVariant,
  WordlistDefinition,
  WordlistEntry
} from "@tsz/types";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export function dictionaryDefinition(
  definitions: WordlistDefinition[],
  level: CEFRLevel
) {
  const target = LEVELS.indexOf(level);
  return definitions
    .filter((d) => LEVELS.includes(d.level))
    .sort((a, b) => {
      const ai = LEVELS.indexOf(a.level),
        bi = LEVELS.indexOf(b.level);
      return (
        Math.abs(ai - target) - Math.abs(bi - target) ||
        ai - bi ||
        Number(b.definition_mode.startsWith("zh_")) -
          Number(a.definition_mode.startsWith("zh_"))
      );
    })[0];
}
export function dictionarySpellings(
  entry: WordlistEntry,
  variant: EnglishVariant | null
) {
  const bases = entry.pos
    .flatMap((p) => p.forms ?? [])
    .filter((f) => f.form_type === "base")
    .flatMap((f) => f.variants);
  const dialect = variant === "AmE" ? "us" : "uk";
  const main =
    bases.find((b) => b.dialect === dialect) ??
    bases.find((b) => b.dialect === "common") ??
    bases[0];
  const primary = main?.spelling || entry.label;
  return {
    primary,
    alternate: [...new Set(bases.map((b) => b.spelling))]
      .filter((s) => s !== primary)
      .join(" / ")
  };
}
export const POS_ABBR: Record<string, string> = {
  noun: "n.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
  pronoun: "pron.",
  preposition: "prep.",
  conjunction: "conj.",
  interjection: "int.",
  determiner: "det.",
  numeral: "num."
};
