import type { FormsImpactItemV2 } from "@tsz/types";

const NODE_TYPE_LABELS: Record<string, string> = {
  pos: "词性",
  grammar_structure: "语法结构",
  sense: "词义",
  definition: "释义",
  sentence: "例句"
};

export interface FormsImpactGroup {
  reason: string;
  count: number;
  type_counts: Array<{ label: string; count: number }>;
}

export interface FormsImpactSummary {
  affected_count: number;
  type_counts: Array<{ label: string; count: number }>;
  groups: FormsImpactGroup[];
  warnings: string[];
  can_confirm: boolean;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toCounts(map: Map<string, number>) {
  return [...map].map(([label, count]) => ({ label, count }));
}

export function summarizeFormsImpact(
  affected: readonly FormsImpactItemV2[]
): FormsImpactSummary {
  const seenNodeIds = new Set<string>();
  const typeCounts = new Map<string, number>();
  const groups = new Map<
    string,
    { count: number; typeCounts: Map<string, number> }
  >();
  let duplicateNodeId = false;
  let unknownNodeType = false;
  let blankReason = false;

  for (const item of affected) {
    if (seenNodeIds.has(item.node_id)) {
      duplicateNodeId = true;
      continue;
    }
    seenNodeIds.add(item.node_id);

    const label = NODE_TYPE_LABELS[item.node_type] ?? "其他类型";
    if (!(item.node_type in NODE_TYPE_LABELS)) unknownNodeType = true;
    const trimmedReason = item.reason.trim();
    const reason = trimmedReason || "未说明原因";
    if (!trimmedReason) blankReason = true;

    increment(typeCounts, label);
    const group = groups.get(reason) ?? {
      count: 0,
      typeCounts: new Map<string, number>()
    };
    group.count += 1;
    increment(group.typeCounts, label);
    groups.set(reason, group);
  }

  const warnings: string[] = [];
  if (duplicateNodeId) warnings.push("响应包含重复节点，已按节点去重统计");
  if (unknownNodeType) warnings.push("响应包含未知节点类型，已归入其他类型");
  if (blankReason) warnings.push("部分受影响节点未说明原因");
  if (seenNodeIds.size === 0) {
    warnings.push("服务未返回受影响节点，无法确认本次影响");
  }

  return {
    affected_count: seenNodeIds.size,
    type_counts: toCounts(typeCounts),
    groups: [...groups].map(([reason, group]) => ({
      reason,
      count: group.count,
      type_counts: toCounts(group.typeCounts)
    })),
    warnings,
    can_confirm: seenNodeIds.size > 0
  };
}
