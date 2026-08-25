import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue
} from "@tsz/types";
import {
  v3IssueNavigationTarget,
  type V3IssueNavigationTarget
} from "./issueNavigation";

export type V3ReadinessNodeRole =
  | "pos"
  | "form_group"
  | "group_membership"
  | "concrete_form"
  | "variant"
  | "pronunciation";

export interface V3ReadinessNode {
  role: V3ReadinessNodeRole;
  node_id: string;
  issue_count: number;
  first_target?: V3IssueNavigationTarget;
  context_group_ids: string[];
  children: V3ReadinessNode[];
}

export interface V3ReadinessSummary {
  issue_count: number;
  first_target?: V3IssueNavigationTarget;
  positions: V3ReadinessNode[];
}

interface MutableNode extends V3ReadinessNode {
  children: MutableNode[];
  issueKeys: Set<string>;
  childMap: Map<string, MutableNode>;
  contextGroups: Set<string>;
}

function uniqueIssues(issues: readonly V3DraftValidationIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [
      issue.schema_version,
      issue.step,
      issue.node_id,
      issue.field,
      issue.code
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function node(role: V3ReadinessNodeRole, node_id: string): MutableNode {
  return {
    role,
    node_id,
    issue_count: 0,
    context_group_ids: [],
    children: [],
    issueKeys: new Set(),
    childMap: new Map(),
    contextGroups: new Set()
  };
}

function child(
  parent: MutableNode,
  role: V3ReadinessNodeRole,
  nodeId: string
): MutableNode {
  const key = `${role}:${nodeId}`;
  let value = parent.childMap.get(key);
  if (!value) {
    value = node(role, nodeId);
    parent.childMap.set(key, value);
    parent.children.push(value);
  }
  return value;
}

function addIssue(
  current: MutableNode,
  issueKey: string,
  target: V3IssueNavigationTarget
) {
  current.issueKeys.add(issueKey);
  current.issue_count = current.issueKeys.size;
  current.first_target ??= target;
}

function finish(current: MutableNode): V3ReadinessNode {
  return {
    role: current.role,
    node_id: current.node_id,
    issue_count: current.issue_count,
    ...(current.first_target ? { first_target: current.first_target } : {}),
    context_group_ids: [...current.contextGroups],
    children: current.children.map(finish)
  };
}

/**
 * Normalizes the server-authoritative issue list into UUID-addressed nodes.
 * Forms are canonical siblings of groups so one form shared by several groups
 * is counted once; its group contexts remain available for display.
 */
export function buildV3Readiness(
  issues: readonly V3DraftValidationIssue[],
  content?: DraftFormsStepContentV3
): V3ReadinessSummary {
  const unique = uniqueIssues(issues);
  const root = node("pos", "root");
  const formGroupContexts = new Map<string, string[]>();
  for (const pos of content?.pos ?? []) {
    for (const group of pos.form_groups) {
      for (const member of group.members) {
        const key = `${pos.pos_id}:${member.form_id}`;
        const groups = formGroupContexts.get(key) ?? [];
        if (!groups.includes(group.id)) groups.push(group.id);
        formGroupContexts.set(key, groups);
      }
    }
  }

  unique.forEach((issue, index) => {
    const location = issue.node_location;
    const issueKey = `${index}:${issue.node_id}:${issue.field}:${issue.code}`;
    const target = v3IssueNavigationTarget(issue);
    const posId = location.pos_id ?? issue.node_id;
    const pos = child(root, "pos", posId);
    addIssue(pos, issueKey, target);

    if (location.form_group_id) {
      const group = child(pos, "form_group", location.form_group_id);
      addIssue(group, issueKey, target);
      if (location.membership_id) {
        addIssue(
          child(group, "group_membership", location.membership_id),
          issueKey,
          target
        );
      }
    }

    if (location.form_id) {
      const form = child(pos, "concrete_form", location.form_id);
      addIssue(form, issueKey, target);
      for (const groupId of formGroupContexts.get(
        `${posId}:${location.form_id}`
      ) ?? []) {
        form.contextGroups.add(groupId);
      }
      if (location.form_group_id) {
        form.contextGroups.add(location.form_group_id);
      }
      if (location.variant_id) {
        const variant = child(form, "variant", location.variant_id);
        addIssue(variant, issueKey, target);
        if (location.pronunciation_id) {
          addIssue(
            child(variant, "pronunciation", location.pronunciation_id),
            issueKey,
            target
          );
        }
      }
    }
  });

  return {
    issue_count: unique.length,
    ...(unique[0] ? { first_target: v3IssueNavigationTarget(unique[0]) } : {}),
    positions: root.children.map(finish)
  };
}
