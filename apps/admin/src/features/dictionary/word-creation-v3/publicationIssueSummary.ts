import type {
  AdminWordV3,
  PersistedWordStep,
  V3DraftValidationIssue,
  V3ValidationIssueCode
} from "@tsz/types";
import { formTypeLabel, partOfSpeechLabel } from "./presentation";
import { v3IssueMessage } from "./presentationErrors";

const STEP_LABEL: Record<PersistedWordStep, string> = {
  basics: "创建新词条",
  forms: "词形与发音",
  meanings: "词义与例句"
};

export interface V3PublicationIssuePosition {
  key: string;
  testId: string;
  label: string;
  pos_id?: string;
  by_step: Record<PersistedWordStep, number>;
  issues: V3DraftValidationIssue[];
}

export interface V3PublicationIssueType {
  code: V3ValidationIssueCode;
  label: string;
  count: number;
  scopes: string[];
  issues: V3DraftValidationIssue[];
}

export interface V3PublicationIssueSummary {
  total: number;
  positions: V3PublicationIssuePosition[];
  types: V3PublicationIssueType[];
}

function issueNodeIds(issue: V3DraftValidationIssue) {
  return new Set([issue.node_id, ...issue.node_location.ancestor_node_ids]);
}

function formPosOwnsIssue(
  word: AdminWordV3,
  posId: string,
  nodeIds: ReadonlySet<string>
) {
  const pos = word.forms.pos.find((candidate) => candidate.pos_id === posId);
  if (!pos) return false;
  if (nodeIds.has(pos.pos_id)) return true;
  if (
    pos.form_groups.some(
      (group) =>
        nodeIds.has(group.id) ||
        group.members.some(
          (membership) =>
            nodeIds.has(membership.id) || nodeIds.has(membership.form_id)
        )
    )
  ) {
    return true;
  }
  return pos.forms.some((form) => {
    if (nodeIds.has(form.id)) return true;
    const variants =
      form.regional_variants.mode === "common"
        ? [form.regional_variants.common]
        : [form.regional_variants.uk, form.regional_variants.us];
    return variants.some(
      (variant) =>
        nodeIds.has(variant.id) ||
        variant.pronunciations.some((item) => nodeIds.has(item.id)) ||
        (variant.component_usages ?? []).some((item) => nodeIds.has(item.id))
    );
  });
}

function meaningPosOwnsIssue(
  word: AdminWordV3,
  posId: string,
  nodeIds: ReadonlySet<string>
) {
  const pos = word.meanings.pos.find((candidate) => candidate.pos_id === posId);
  if (!pos) return false;
  if (nodeIds.has(pos.pos_id)) return true;
  if (
    pos.grammar_structures.some(
      (grammar) =>
        nodeIds.has(grammar.id) ||
        grammar.variants.some((variant) => nodeIds.has(variant.id))
    )
  ) {
    return true;
  }
  return pos.senses.some((sense) => {
    if (nodeIds.has(sense.id)) return true;
    if (sense.sense_group_id && nodeIds.has(sense.sense_group_id)) return true;
    if (
      sense.definitions.some((definition) => {
        if (nodeIds.has(definition.id)) return true;
        if ("content_id" in definition && nodeIds.has(definition.content_id)) {
          return true;
        }
        if ("mode" in definition.content) {
          if (definition.content.mode === "unified") {
            return nodeIds.has(definition.content.common.id);
          }
          return [definition.content.uk, definition.content.us].some(
            (side) => side.state === "ready" && nodeIds.has(side.variant.id)
          );
        }
        return false;
      })
    ) {
      return true;
    }
    if (
      sense.sentences.some((sentence) => {
        if (
          nodeIds.has(sentence.id) ||
          nodeIds.has(sentence.zh_text_id) ||
          sentence.zh_translations?.some((translation) =>
            nodeIds.has(translation.id)
          )
        ) {
          return true;
        }
        if (sentence.en_text.mode === "unified") {
          return nodeIds.has(sentence.en_text.common.id);
        }
        return [sentence.en_text.uk, sentence.en_text.us].some(
          (side) => side.state === "ready" && nodeIds.has(side.variant.id)
        );
      })
    ) {
      return true;
    }
    return sense.relations.some((relation) => nodeIds.has(relation.id));
  });
}

function positionForIssue(
  word: AdminWordV3,
  issue: V3DraftValidationIssue
): Omit<V3PublicationIssuePosition, "by_step" | "issues"> {
  const nodeIds = issueNodeIds(issue);
  const pos = word.forms.pos.find(
    (candidate) =>
      candidate.pos_id === issue.node_location.pos_id ||
      formPosOwnsIssue(word, candidate.pos_id, nodeIds) ||
      meaningPosOwnsIssue(word, candidate.pos_id, nodeIds)
  );
  if (pos) {
    return {
      key: `pos:${pos.pos_id}`,
      testId: `issue-pos-${pos.pos}`,
      label: partOfSpeechLabel(pos.pos),
      pos_id: pos.pos_id
    };
  }
  return {
    key: `step:${issue.step}`,
    testId: `issue-step-${issue.step}`,
    label: STEP_LABEL[issue.step]
  };
}

function issueWithResolvedPosition(
  word: AdminWordV3,
  issue: V3DraftValidationIssue
): V3DraftValidationIssue {
  const position = positionForIssue(word, issue);
  if (!position.pos_id || issue.node_location.pos_id === position.pos_id) {
    return issue;
  }
  return {
    ...issue,
    node_location: {
      ...issue.node_location,
      pos_id: position.pos_id
    }
  };
}

function emptyStepCounts(): Record<PersistedWordStep, number> {
  return { basics: 0, forms: 0, meanings: 0 };
}

function issueScopes(
  word: AdminWordV3,
  issues: readonly V3DraftValidationIssue[]
) {
  const groups = groupIssuesByPosition(word, issues);
  return groups.map((position) => {
    const formTypes = new Map<string, number>();
    for (const issue of position.issues) {
      const formType = issue.node_location.form_type;
      if (!formType) continue;
      const label = formTypeLabel(formType);
      formTypes.set(label, (formTypes.get(label) ?? 0) + 1);
    }
    if (formTypes.size === 0) {
      return `${position.label} ${position.issues.length} 项`;
    }
    return `${position.label}：${[...formTypes]
      .map(([label, count]) => `${label} ${count} 项`)
      .join("、")}`;
  });
}

function groupIssuesByPosition(
  word: AdminWordV3,
  issues: readonly V3DraftValidationIssue[]
) {
  const groups = new Map<string, V3PublicationIssuePosition>();
  for (const issue of issues) {
    const position = positionForIssue(word, issue);
    const current = groups.get(position.key);
    if (current) {
      current.issues.push(issue);
      current.by_step[issue.step] += 1;
      continue;
    }
    const byStep = emptyStepCounts();
    byStep[issue.step] = 1;
    groups.set(position.key, {
      ...position,
      by_step: byStep,
      issues: [issue]
    });
  }
  return [...groups.values()];
}

export function buildV3PublicationIssueSummary(
  word: AdminWordV3,
  issues: readonly V3DraftValidationIssue[]
): V3PublicationIssueSummary {
  const positionedIssues = issues.map((issue) =>
    issueWithResolvedPosition(word, issue)
  );
  const types = new Map<V3ValidationIssueCode, V3DraftValidationIssue[]>();
  for (const issue of positionedIssues) {
    const current = types.get(issue.code);
    if (current) current.push(issue);
    else types.set(issue.code, [issue]);
  }
  return {
    total: issues.length,
    positions: groupIssuesByPosition(word, positionedIssues),
    types: [...types].map(([code, groupedIssues]) => ({
      code,
      label: v3IssueMessage(groupedIssues[0]!),
      count: groupedIssues.length,
      scopes: issueScopes(word, groupedIssues),
      issues: groupedIssues
    }))
  };
}
