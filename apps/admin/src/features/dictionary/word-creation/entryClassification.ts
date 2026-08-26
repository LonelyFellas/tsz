export type ClassifiedEntryInput = {
  normalized: string;
  kind: "word" | "phrase";
};

/** Product-only routing decision; backend detection remains authoritative. */
export function classifyEntryInput(raw: string): ClassifiedEntryInput {
  const normalized = raw.trim().replace(/\s+/gu, " ");
  return {
    normalized,
    kind: normalized.includes(" ") ? "phrase" : "word"
  };
}
