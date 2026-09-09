import type { WordRelationWritableV3 } from "@tsz/types";

/** 同一源词义内，手动词义按关系类型与词面合组；已关联派生词按目标合组。 */
export function groupRelations<T extends WordRelationWritableV3>(
  relations: T[]
): T[][] {
  const groups: T[][] = [];
  const groupedTargets = new Map<string, T[]>();
  for (const relation of relations) {
    const targetKey = relation.target_word_id
      ? `word:${relation.target_word_id}`
      : relation.pending_target_headword?.trim()
        ? `text:${relation.pending_target_headword.trim().toLowerCase()}`
        : undefined;
    if (
      targetKey &&
      (relation.relation === "derivative" || !relation.target_word_id)
    ) {
      const key = `${relation.relation}:${targetKey}`;
      const group = groupedTargets.get(key);
      if (group) {
        group.push(relation);
        continue;
      }
      const next = [relation];
      groupedTargets.set(key, next);
      groups.push(next);
    } else {
      groups.push([relation]);
    }
  }
  return groups;
}

export function replaceRelationGroup(
  relations: WordRelationWritableV3[],
  group: WordRelationWritableV3[],
  replacement: WordRelationWritableV3[]
): WordRelationWritableV3[] {
  const ids = new Set(group.map((relation) => relation.id));
  return relations.flatMap((relation) =>
    relation.id === group[0]!.id
      ? replacement
      : ids.has(relation.id)
        ? []
        : [relation]
  );
}

export function selectDerivativeSenses(
  group: WordRelationWritableV3[],
  senseIds: string[],
  idFactory: () => string
): WordRelationWritableV3[] {
  const first = group[0]!;
  if (!senseIds.length) {
    const next = { ...first };
    delete next.target_sense_id;
    return [next];
  }
  return [...new Set(senseIds)].map((senseId, index) => {
    const existing = group.find(
      (relation) => relation.target_sense_id === senseId
    );
    return (
      existing ?? {
        id: !first.target_sense_id && index === 0 ? first.id : idFactory(),
        relation: "derivative",
        target_word_id: first.target_word_id,
        target_sense_id: senseId,
        score: first.score
      }
    );
  });
}
