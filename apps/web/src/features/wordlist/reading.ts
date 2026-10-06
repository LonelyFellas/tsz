import type {
  CEFRLevel,
  WordlistDefinition,
  WordlistText,
  WordlistState,
  EnglishVariant
} from "@tsz/types";
const LEVELS: readonly string[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export function selectDefinition(
  definitions: WordlistDefinition[],
  level: CEFRLevel
) {
  const ceiling = LEVELS.indexOf(level);
  const eligible = definitions.filter(
    (d) => LEVELS.indexOf(d.level) >= 0 && LEVELS.indexOf(d.level) <= ceiling
  );
  const best = Math.max(-1, ...eligible.map((d) => LEVELS.indexOf(d.level)));
  const candidates = eligible.filter((d) => LEVELS.indexOf(d.level) === best);
  return (
    candidates.find((d) => d.definition_mode.startsWith("zh_")) ?? candidates[0]
  );
}
export function selectTexts<T extends Pick<WordlistText, "dialect">>(
  texts: T[],
  variant: EnglishVariant | null
) {
  if (!variant) return texts;
  const selected = texts.filter(
    (t) =>
      t.dialect === "common" || t.dialect === (variant === "BrE" ? "uk" : "us")
  );
  return selected.length ? selected : texts;
}
export const STATE_LABEL: Record<WordlistState, string> = {
  draft: "私密草稿",
  pending: "待审核",
  published: "已公开",
  rejected: "审核未通过",
  withdrawn: "已下架"
};
export const buttonClass =
  "rounded-full border border-border px-4 py-2 text-sm disabled:opacity-40";

export function phoneticDelimiters(text: string) {
  const value = text.trim();
  return (value.startsWith("/") && value.endsWith("/")) ||
    (value.startsWith("[") && value.endsWith("]"))
    ? (["", ""] as const)
    : (["/", "/"] as const);
}
