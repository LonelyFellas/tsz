import type {
  DraftFormsStepContentV3,
  DraftMeaningsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  PersistedWordStep,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue
} from "@tsz/types";
import {
  v3IssueNavigationTarget,
  type V3IssueNavigationTarget
} from "./issueNavigation";

import { CEFR_OPTIONS } from "../labels";
import { definitionSummary } from "./meaningsModel";
import { languageSummary, partOfSpeechLabel } from "./presentation";

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

export type V3ProductProgressKey =
  | "dialect"
  | "parts_of_speech"
  | "forms"
  | "sense_groups"
  | "grammar_structures"
  | "senses"
  | "sentences";

export interface V3ProductProgressDetail {
  key: string;
  label: string;
  count?: number;
  dialect?: "uk" | "us";
  items?: readonly { key: string; label: string }[];
}

export interface V3ProductProgressRow {
  key: V3ProductProgressKey;
  index: number;
  label: string;
  completed: boolean;
  value?: "完成" | "未完成";
  details: readonly V3ProductProgressDetail[];
  statusDescription?: string;
  count?: number;
  target: V3IssueNavigationTarget;
}

export interface V3ProductProgressInput {
  wordId: string;
  language: string;
  partOfSpeechCatalog?: readonly PartOfSpeechCatalogItem[];
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
  completedSteps: readonly PersistedWordStep[];
  forms: DraftFormsStepContentV3;
  meanings: DraftMeaningsStepContentV3 | DraftMeaningsStepContentWritableV3;
  issues: readonly V3DraftValidationIssue[];
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

function touchesNode(
  issue: V3DraftValidationIssue,
  nodeIds: ReadonlySet<string>
) {
  return (
    nodeIds.has(issue.node_id) ||
    issue.node_location.ancestor_node_ids.some((id) => nodeIds.has(id))
  );
}

export function buildV3ProductProgress({
  wordId,
  language,
  partOfSpeechCatalog = [],
  dirtySteps = { forms: false, meanings: false },
  completedSteps,
  forms,
  meanings,
  issues
}: V3ProductProgressInput): V3ProductProgressRow[] {
  const completed = new Set(completedSteps);
  const firstPos = forms.pos[0];
  const defaultFormsTarget: V3IssueNavigationTarget = firstPos
    ? {
        step: "forms",
        pos_id: firstPos.pos_id,
        node_id: firstPos.pos_id,
        field: "dialect_rules"
      }
    : { step: "forms", node_id: wordId, field: "pos" };
  const derivedForms = forms.pos.flatMap((pos) =>
    pos.forms
      .filter((form) => form.form_type !== "base")
      .map((form) => {
        const group = pos.form_groups.find((candidate) =>
          candidate.members.some((member) => member.form_id === form.id)
        );
        const membership = group?.members.find(
          (member) => member.form_id === form.id
        );
        return { pos, form, group, membership };
      })
  );
  const grammarEntries = meanings.pos.flatMap((pos) =>
    pos.grammar_structures.map((grammar) => ({ pos, grammar }))
  );
  const senseEntries = meanings.pos.flatMap((pos) =>
    pos.senses.map((sense) => ({ pos, sense }))
  );
  const sentenceEntries = senseEntries.flatMap(({ pos, sense }) =>
    sense.sentences.map((sentence) => ({ pos, sense, sentence }))
  );
  const formNodeIds = (
    form: DraftFormsStepContentV3["pos"][number]["forms"][number]
  ) => [
    form.id,
    ...(form.regional_variants.mode === "common"
      ? [
          form.regional_variants.common.id,
          ...form.regional_variants.common.pronunciations.map(
            (pronunciation) => pronunciation.id
          )
        ]
      : [
          form.regional_variants.uk.id,
          ...form.regional_variants.uk.pronunciations.map(
            (pronunciation) => pronunciation.id
          ),
          form.regional_variants.us.id,
          ...form.regional_variants.us.pronunciations.map(
            (pronunciation) => pronunciation.id
          )
        ])
  ];
  const baseFormNodeIds = new Set(
    forms.pos.flatMap((pos) =>
      pos.forms.filter((form) => form.form_type === "base").flatMap(formNodeIds)
    )
  );
  const derivedFormNodeIds = new Set(
    derivedForms.flatMap(({ form }) => formNodeIds(form))
  );

  const grammarNodeIds = new Set(
    grammarEntries.flatMap(({ grammar }) => [
      grammar.id,
      ...grammar.variants.map((variant) => variant.id)
    ])
  );
  const senseGroupNodeIds = new Set(
    meanings.sense_groups.map((group) => group.id)
  );
  const sentenceNodeIds = new Set(
    sentenceEntries.flatMap(({ sentence }) => [
      sentence.id,
      sentence.zh_text_id,
      ...(sentence.en_text.mode === "unified"
        ? [sentence.en_text.common.id]
        : [
            ...(sentence.en_text.uk.state === "ready"
              ? [sentence.en_text.uk.variant.id]
              : []),
            ...(sentence.en_text.us.state === "ready"
              ? [sentence.en_text.us.variant.id]
              : [])
          ])
    ])
  );
  const senseNodeIds = new Set([
    ...senseEntries.flatMap(({ sense }) => [
      sense.id,
      ...sense.definitions.flatMap((definition) => [
        definition.id,
        ...("content_id" in definition ? [definition.content_id] : [])
      ]),
      ...sense.relations.map((relation) => relation.id)
    ])
  ]);

  const formIssues = issues.filter((issue) => issue.step === "forms");
  const posIssue = formIssues.find(
    (issue) =>
      issue.node_location.node_role === "pos" ||
      issue.node_location.form_type === "base" ||
      touchesNode(issue, baseFormNodeIds)
  );
  const derivedIssue = formIssues.find(
    (issue) =>
      issue !== posIssue &&
      (touchesNode(issue, derivedFormNodeIds) ||
        issue.node_location.form_type !== "base")
  );
  const meaningIssues = issues.filter((issue) => issue.step === "meanings");
  const grammarIssue = meaningIssues.find((issue) =>
    touchesNode(issue, grammarNodeIds)
  );
  const senseGroupIssue = meaningIssues.find((issue) =>
    touchesNode(issue, senseGroupNodeIds)
  );
  const sentenceIssue = meaningIssues.find((issue) =>
    touchesNode(issue, sentenceNodeIds)
  );
  const senseIssue = meaningIssues.find(
    (issue) =>
      issue !== grammarIssue &&
      issue !== senseGroupIssue &&
      issue !== sentenceIssue &&
      (touchesNode(issue, senseNodeIds) || meaningIssues.length > 0)
  );

  const languageInfo = languageSummary(language);
  const catalogNames = new Map(
    partOfSpeechCatalog.map((part) => [
      part.code,
      part.name_zh.trim() || part.name_en.trim()
    ])
  );
  const meaningsByPos = new Map(meanings.pos.map((pos) => [pos.pos_id, pos]));
  const formPosIds = new Set(forms.pos.map((pos) => pos.pos_id));
  const positions = [
    ...forms.pos.map((pos) => ({
      key: pos.pos_id,
      label:
        catalogNames.get(pos.pos) ||
        (partOfSpeechLabel(pos.pos) === "其他词性"
          ? pos.pos
          : partOfSpeechLabel(pos.pos)),
      forms: pos.forms,
      meanings: meaningsByPos.get(pos.pos_id)
    })),
    ...meanings.pos
      .filter((pos) => !formPosIds.has(pos.pos_id))
      .map((pos) => ({
        key: pos.pos_id,
        label: "未识别词性",
        forms: [],
        meanings: pos
      }))
  ];
  const hasUnmatchedPos = meanings.pos.some(
    (pos) => !formPosIds.has(pos.pos_id)
  );
  const distinguish =
    language === "en" &&
    forms.pos.some(
      (pos) =>
        pos.dialect_rules.spelling_mode === "distinguish" ||
        pos.dialect_rules.phonetic_mode === "distinguish"
    );
  const levelCounts = new Map<string, number>();
  for (const { sentence } of sentenceEntries) {
    const level = CEFR_OPTIONS.some((option) => option.value === sentence.level)
      ? sentence.level
      : "ungraded";
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }
  const details: Record<V3ProductProgressKey, V3ProductProgressDetail[]> = {
    dialect: [
      { key: "language", label: languageInfo.label },
      ...(distinguish
        ? ([
            { key: "uk", label: "英式 BrE", dialect: "uk" },
            { key: "us", label: "美式 AmE", dialect: "us" }
          ] as const)
        : [])
    ],
    parts_of_speech: positions
      .filter((pos) => formPosIds.has(pos.key))
      .map(({ key, label }) => ({ key, label })),
    forms: positions
      .filter((pos) => formPosIds.has(pos.key))
      .map((pos) => ({
        key: pos.key,
        label: pos.label,
        count: pos.forms.filter((form) => form.form_type !== "base").length
      })),
    sense_groups: meanings.sense_groups.map((group, index) => ({
      key: group.id,
      label: `${index + 1}. ${group.name_zh.trim() || group.name_en.trim() || "待填写语义区间"}`
    })),
    grammar_structures: positions.map((pos) => ({
      key: pos.key,
      label: pos.label,
      count: pos.meanings?.grammar_structures.length ?? 0
    })),
    senses: positions.map((pos) => ({
      key: pos.key,
      label: pos.label,
      count: pos.meanings?.senses.length ?? 0,
      items: (pos.meanings?.senses ?? []).map((sense, index) => ({
        key: sense.id,
        label: `${index + 1}. ${definitionSummary(sense)}`
      }))
    })),
    sentences: [
      ...CEFR_OPTIONS.flatMap(({ value: level }) => {
        const count = levelCounts.get(level) ?? 0;
        return count > 0 ? [{ key: level, label: level, count }] : [];
      }),
      ...(levelCounts.has("ungraded")
        ? [
            {
              key: "ungraded",
              label: "未分级",
              count: levelCounts.get("ungraded")!
            }
          ]
        : [])
    ]
  };

  const firstDerived = derivedForms[0];
  const firstSenseGroup = meanings.sense_groups[0];
  const firstGrammar = grammarEntries[0];
  const firstSense = senseEntries[0];
  const firstSentence = sentenceEntries[0];
  const rows: Omit<V3ProductProgressRow, "details">[] = [
    {
      key: "dialect",
      index: 1,
      label: "语言识别",
      completed: completed.has("basics") && languageInfo.identified,
      value:
        completed.has("basics") && languageInfo.identified ? "完成" : "未完成",
      target: { step: "basics", node_id: wordId, field: "presentation" }
    },
    {
      key: "parts_of_speech",
      index: 2,
      label: "基本词性",
      completed: completed.has("forms"),
      count: forms.pos.length,
      target: posIssue ? v3IssueNavigationTarget(posIssue) : defaultFormsTarget
    },
    {
      key: "forms",
      index: 3,
      label: "词形变化",
      completed: completed.has("forms"),
      count: derivedForms.length,
      target: derivedIssue
        ? v3IssueNavigationTarget(derivedIssue)
        : firstDerived
          ? {
              step: "forms",
              pos_id: firstDerived.pos.pos_id,
              node_id: firstDerived.form.id,
              field: "form_type",
              form_id: firstDerived.form.id,
              ...(firstDerived.group
                ? { form_group_id: firstDerived.group.id }
                : {}),
              ...(firstDerived.membership
                ? { membership_id: firstDerived.membership.id }
                : {})
            }
          : defaultFormsTarget
    },
    {
      key: "sense_groups",
      index: 4,
      label: "语义区间",
      completed: completed.has("meanings"),
      count: meanings.sense_groups.length,
      target: senseGroupIssue
        ? v3IssueNavigationTarget(senseGroupIssue)
        : firstSenseGroup
          ? {
              step: "meanings",
              node_id: firstSenseGroup.id,
              field: "name_zh"
            }
          : {
              step: "meanings",
              node_id: wordId,
              field: "sense_groups"
            }
    },
    {
      key: "grammar_structures",
      index: 5,
      label: "语法结构",
      completed: completed.has("meanings"),
      count: grammarEntries.length,
      target: grammarIssue
        ? v3IssueNavigationTarget(grammarIssue)
        : firstGrammar
          ? {
              step: "meanings",
              pos_id: firstGrammar.pos.pos_id,
              node_id: firstGrammar.grammar.id,
              field: "variants"
            }
          : {
              step: "meanings",
              ...(firstPos ? { pos_id: firstPos.pos_id } : {}),
              node_id: firstPos?.pos_id ?? wordId,
              field: "grammar_structures"
            }
    },
    {
      key: "senses",
      index: 6,
      label: "多维词义",
      completed: completed.has("meanings"),
      count: senseEntries.length,
      target: senseIssue
        ? v3IssueNavigationTarget(senseIssue)
        : firstSense
          ? {
              step: "meanings",
              pos_id: firstSense.pos.pos_id,
              node_id: firstSense.sense.id,
              field: "sense"
            }
          : {
              step: "meanings",
              ...(firstPos ? { pos_id: firstPos.pos_id } : {}),
              node_id: firstPos?.pos_id ?? wordId,
              field: "senses"
            }
    },
    {
      key: "sentences",
      index: 7,
      label: "多维例句",
      completed: completed.has("meanings"),
      count: sentenceEntries.length,
      target: sentenceIssue
        ? v3IssueNavigationTarget(sentenceIssue)
        : firstSentence
          ? {
              step: "meanings",
              pos_id: firstSentence.pos.pos_id,
              node_id: firstSentence.sentence.id,
              field: "sentence"
            }
          : firstSense
            ? {
                step: "meanings",
                pos_id: firstSense.pos.pos_id,
                node_id: firstSense.sense.id,
                field: "sentences"
              }
            : {
                step: "meanings",
                ...(firstPos ? { pos_id: firstPos.pos_id } : {}),
                node_id: firstPos?.pos_id ?? wordId,
                field: "senses"
              }
    }
  ];
  return rows.map((row) => {
    const step =
      row.key === "dialect"
        ? "basics"
        : row.key === "parts_of_speech" || row.key === "forms"
          ? "forms"
          : "meanings";
    const dirty = step !== "basics" && dirtySteps[step];
    return {
      ...row,
      completed:
        row.completed && !dirty && !(step === "meanings" && hasUnmatchedPos),
      details: details[row.key],
      ...(dirty ? { statusDescription: "编辑中，完成状态待确认" } : {})
    };
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
