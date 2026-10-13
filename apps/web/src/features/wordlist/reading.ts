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
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-medium tracking-wide text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-primary/40 aria-pressed:bg-primary-muted aria-pressed:text-primary";
export const primaryButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium tracking-wide text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)] transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";
export const textButtonClass =
  "mx-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";
export const inputClass =
  "min-h-11 min-w-0 rounded-full border border-border bg-surface px-5 text-sm text-foreground outline-hidden transition-shadow placeholder:text-foreground-subtle focus:border-primary/50 focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50";

export function phoneticDelimiters(text: string) {
  const value = text.trim();
  return (value.startsWith("/") && value.endsWith("/")) ||
    (value.startsWith("[") && value.endsWith("]"))
    ? (["", ""] as const)
    : (["/", "/"] as const);
}
