import type { NextSentenceTranslation, NextSentenceVariant } from "@tsz/types";

export const sentenceLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const sentenceStyles = {
  word_for_word: "直译",
  balanced_fluency: "意译",
  adapted_creation: "创译"
} as const;
export function freedomCategory(value: number) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100 ||
    Math.abs(value * 10 - Math.round(value * 10)) > 1e-8
  )
    return undefined;
  return value <= 100 / 3
    ? "word_for_word"
    : value <= 200 / 3
      ? "balanced_fluency"
      : "adapted_creation";
}
export function translationStyle(row: NextSentenceTranslation) {
  return row.metadata ? freedomCategory(row.metadata.freedom ?? 0) : row.style;
}
export function normalizeTranslationFreedom(
  row: NextSentenceTranslation
): NextSentenceTranslation {
  const freedom = row.metadata?.freedom ?? 0;
  return {
    ...row,
    style: freedomCategory(freedom) ?? row.style,
    metadata: { ...row.metadata, freedom, sources: row.metadata?.sources ?? [] }
  };
}
export function sentenceError(variant: NextSentenceVariant) {
  for (const row of variant.translations) {
    if (!row.content.text.trim()) return "译文不能为空；不需要的译文请移除";
    if (row.metadata?.freedom != null && !freedomCategory(row.metadata.freedom))
      return "翻译自由度须为 0–100%，最多一位小数";
  }
}
export function exampleWordCount(text: string) {
  return (
    text.match(
      /(?:\p{N}+(?:[,.]\p{N}+)+|\p{L}(?:\.\p{L})+\.?|[\p{L}\p{N}]+)(?:['’\-\u2010\u2011](?:\p{L}(?:\.\p{L})+\.?|[\p{L}\p{N}]+))*/gu
    ) ?? []
  ).length;
}
function alphabeticKey(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function sortExamples(rows: NextSentenceVariant[]) {
  return [...rows].sort(
    (a, b) =>
      sentenceLevels.indexOf(a.level) - sentenceLevels.indexOf(b.level) ||
      exampleWordCount(a.content.text) - exampleWordCount(b.content.text) ||
      alphabeticKey(a.content.text).localeCompare(
        alphabeticKey(b.content.text),
        "en"
      ) ||
      a.id.localeCompare(b.id)
  );
}
export function exampleLevelContext(
  rows: NextSentenceVariant[],
  reading: string,
  sense?: string
) {
  const ceiling = sentenceLevels.indexOf(reading);
  const available = sentenceLevels.filter((level) =>
    rows.some((row) => row.level === level)
  );
  const readable = available.filter(
    (level) => sentenceLevels.indexOf(level) <= ceiling
  );
  const nearest = (levels: string[], to: number) =>
    [...levels].sort(
      (a, b) =>
        Math.abs(sentenceLevels.indexOf(a) - to) -
          Math.abs(sentenceLevels.indexOf(b) - to) ||
        sentenceLevels.indexOf(a) - sentenceLevels.indexOf(b)
    )[0];
  const selectable = readable.length
    ? readable
    : available.length
      ? [nearest(available, ceiling)!]
      : [];
  return {
    available,
    selectable,
    fallback: !readable.length && !!available.length,
    preferred: nearest(selectable, sentenceLevels.indexOf(sense ?? reading))
  };
}
export function randomTranslation(
  rows: NextSentenceTranslation[],
  random = Math.random
) {
  return rows.length
    ? rows[Math.min(rows.length - 1, Math.floor(random() * rows.length))]
    : undefined;
}
export function nextTranslation(
  rows: NextSentenceTranslation[],
  current: string | undefined,
  seen: string[],
  clicks: number,
  reading: string,
  random = Math.random
) {
  const other = rows.filter((row) => row.id !== current);
  if (!other.length)
    return {
      row: rows.find((row) => row.id === current),
      seen,
      missing: undefined
    };
  const preferred: keyof typeof sentenceStyles | undefined =
    clicks === 0
      ? sentenceLevels.indexOf(reading) >= 2
        ? "adapted_creation"
        : "word_for_word"
      : undefined;
  const group = preferred
    ? other.filter((row) => translationStyle(row) === preferred)
    : [];
  let unseen = other.filter((row) => !seen.includes(row.id));
  const restart = !group.length && !unseen.length;
  if (restart) unseen = other;
  const row = randomTranslation(group.length ? group : unseen, random)!;
  return {
    row,
    seen: [...(restart ? (current ? [current] : []) : seen), row.id],
    missing:
      preferred && !rows.some((row) => translationStyle(row) === preferred)
        ? preferred
        : undefined
  };
}
