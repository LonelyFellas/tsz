import type { NextAgentRelation, NextDraft } from "@tsz/types";
import { validateEntryInput } from "@/features/dictionary/word-creation/entryClassification";
import {
  RELATION_TYPES,
  type RelationType
} from "@/features/dictionary/word-creation-v3/presentation";
import { normalizeSentenceSurface } from "@/features/sentences/associationModel";
import { draftForms } from "./model";

type RelationCandidate = NextAgentRelation & { kind: RelationType };

export function generatedRelationCandidates(
  draft: NextDraft,
  rows: NextAgentRelation[],
  senseCount: number
): RelationCandidate[] {
  if (!rows.length) return [];

  const headword = normalizeSentenceSurface(draft.headword);
  const entryForms = new Set(
    draftForms(draft).map(({ text }) => normalizeSentenceSurface(text))
  );
  entryForms.add(headword);
  if (/^[a-z]+$/u.test(headword)) {
    // Old candidates may predate the generation rule, and the form editor may still be empty.
    const sForm = /[^aeiou]y$/u.test(headword)
      ? headword.slice(0, -1) + "ies"
      : headword + (/(?:s|x|z|ch|sh)$/u.test(headword) ? "es" : "s");
    entryForms.add(sForm);
  }

  const targets = new Map<string, RelationCandidate>();
  const seen = new Set<string>();
  const candidates: RelationCandidate[] = [];
  const ordered = [...rows].sort(
    (left, right) => Number(!left.target) - Number(!right.target)
  );
  for (const row of ordered) {
    const kind = RELATION_TYPES.find((type) => type === row.kind);
    const { normalized: word, issue } = validateEntryInput(row.word);
    const gloss = row.gloss.trim();
    if (
      !kind ||
      !Number.isInteger(row.sense) ||
      row.sense < 0 ||
      row.sense >= senseCount ||
      issue ||
      !gloss ||
      [...gloss].length > 5000 ||
      /\p{Cc}/u.test(row.word + row.gloss) ||
      !Number.isFinite(row.score) ||
      !/^\d+(?:\.\d{1,2})?$/u.test(String(row.score)) ||
      row.score > 100
    )
      continue;

    const key = normalizeSentenceSurface(word);
    if (entryForms.has(key)) continue;
    const target = JSON.stringify([row.sense, kind, key]);
    const first = targets.get(target);
    const identity = JSON.stringify([
      target,
      kind === "derivative" ? gloss : ""
    ]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const candidate = {
      ...row,
      kind,
      word: first?.word ?? word,
      gloss,
      score: first?.score ?? row.score
    };
    if (!first) targets.set(target, candidate);
    candidates.push(candidate);
  }
  return candidates;
}
