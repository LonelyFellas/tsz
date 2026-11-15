import type { NextEquivalent, NextEquivalentMetadata } from "@tsz/types";

export const emptyEquivalentMetadata = (): NextEquivalentMetadata => ({
  register_ids: [],
  domain_ids: [],
  commonness: []
});

export function equivalentKey(text: string) {
  return text.trim().normalize("NFKC").toLowerCase();
}

export function commonnessUnits(value: string): number | undefined {
  if (!/^\d{1,2}(?:\.\d)?$/u.test(value)) return undefined;
  const [whole, fraction = "0"] = value.split(".");
  const units = Number(whole) * 10 + Number(fraction);
  return units >= 1 && units <= 999 ? units : undefined;
}

export function equivalentScore(row: NextEquivalent, domainId?: string) {
  const scores = row.metadata?.commonness ?? [];
  const own = scores.find((score) => score.domain_id === domainId);
  const general = domainId
    ? scores.find((score) => !score.domain_id)
    : undefined;
  return {
    value: own?.score ?? general?.score ?? "",
    inherited: !own && !!general
  };
}

export function setEquivalentScore(
  row: NextEquivalent,
  domainId: string | undefined,
  value: string
): NextEquivalent {
  const metadata = row.metadata ?? emptyEquivalentMetadata();
  const previous = metadata.commonness.find(
    (score) => score.domain_id === domainId
  );
  if (previous?.score === value || (!previous && value === "")) return row;
  const next = { ...(domainId ? { domain_id: domainId } : {}), score: value };
  const commonness = previous
    ? metadata.commonness.flatMap((score) =>
        score.domain_id === domainId ? (value === "" ? [] : [next]) : [score]
      )
    : [...metadata.commonness, next];
  return { ...row, metadata: { ...metadata, commonness } };
}

export function sortedEquivalents(rows: NextEquivalent[], domainId?: string) {
  return [...rows].sort(
    (a, b) =>
      (commonnessUnits(equivalentScore(b, domainId).value) ?? -1) -
      (commonnessUnits(equivalentScore(a, domainId).value) ?? -1)
  );
}

export function parseEquivalentBatch(
  value: string,
  existing: NextEquivalent[],
  locale: string
) {
  const seen = new Set(
    existing
      .filter((row) => row.locale === locale)
      .map((row) => equivalentKey(row.text))
  );
  const words: string[] = [];
  for (const word of value
    .split(/[,，、;；\n\r]+/u)
    .map((word) => word.trim())
    .filter(Boolean)) {
    if ([...word].length > 200 || /\p{Cc}/u.test(word))
      return { error: "text" as const, words: [] };
    const key = equivalentKey(word);
    if (!seen.has(key)) {
      seen.add(key);
      words.push(word);
    }
  }
  return { words };
}
