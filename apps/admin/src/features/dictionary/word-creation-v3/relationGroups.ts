import type { WordRelationWritableV3 } from "@tsz/types";

/** 同一源词义内只有派生词按目标合组：近义词与反义词一个目标只配一条词义。 */
export function groupRelations<T extends WordRelationWritableV3>(
  relations: T[],
  manualRowKeys?: ReadonlyMap<string, string>
): T[][] {
  const groups: T[][] = [];
  const groupedTargets = new Map<string, T[]>();
  for (const relation of relations) {
    const targetKey = relation.target_word_id
      ? `word:${relation.target_word_id}`
      : manualRowKeys?.has(relation.id)
        ? `draft:${manualRowKeys.get(relation.id)}`
        : relation.pending_target_headword?.trim()
          ? `text:${relation.pending_target_headword.trim().toLowerCase()}`
          : undefined;
    if (targetKey && relation.relation === "derivative") {
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
  // 清空词义返回空组，由 replaceRelationGroup 把整条关联删掉。此前这里保留
  // target_word_id 只删 target_sense_id，留下的「有词条没词义」形状存不进库：
  // 数据库的 lexicon_relations_target_shape_check 要求关联词三选一，约束错误被
  // 后端兜底成 500。退回待关联文本也不可行，因为这一层拿不到可靠词面，能拿到的
  // 只有展示用的拼接串（英美双拼写会是「color / colour」）。
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
