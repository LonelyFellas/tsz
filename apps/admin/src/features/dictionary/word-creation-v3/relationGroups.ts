import type { WordRelationWritableV3 } from "@tsz/types";

/** 只合并同一源词义内、指向同一词条的派生关系；wire 仍逐义项保存。 */
export function groupRelations<T extends WordRelationWritableV3>(
  relations: T[]
): T[][] {
  const groups: T[][] = [];
  const derivatives = new Map<string, T[]>();
  for (const relation of relations) {
    if (relation.relation === "derivative" && relation.target_word_id) {
      const group = derivatives.get(relation.target_word_id);
      if (group) {
        group.push(relation);
        continue;
      }
      const next = [relation];
      derivatives.set(relation.target_word_id, next);
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
