import type {
  InboundReferenceNodeV3,
  InboundReferenceV3,
  InboundReferencesV3
} from "@tsz/types";
import { referenceTargetNodeIds } from "./referenceGuard";

/** 多维例句标注：指向词性 / 原形 / 变体 / 词义四个节点。 */
export function sharedSentenceReference(
  target: {
    pos_id: string;
    form_id: string;
    variant_id: string;
    sense_id: string;
    base_form_id?: string;
  },
  overrides: Partial<InboundReferenceV3> & {
    surface?: string;
    text?: string;
    sentence_id?: string;
  } = {}
): InboundReferenceV3 {
  const {
    surface = "orbit",
    text = "The satellite entered orbit.",
    sentence_id = "sentence-1",
    ...rest
  } = overrides;
  const start = Array.from(text.split(surface)[0] ?? "").length;
  return {
    id: `shared_sentence:${sentence_id}`,
    kind: "shared_sentence",
    target: { base_form_id: target.form_id, ...target },
    stale: false,
    source: {
      sentence_id,
      sentence_revision: 1,
      sentence_text: text,
      source_dialect: "common",
      segments: [{ start, end: start + Array.from(surface).length, surface }]
    },
    ...rest
  };
}

export function draftRelationReference(
  senseId: string,
  overrides: Partial<InboundReferenceV3> = {}
): InboundReferenceV3 {
  return {
    id: "draft_relation:relation-1",
    kind: "draft_relation",
    target: { sense_id: senseId, pos_id: "pos-source" },
    stale: false,
    source: {
      entry_id: "entry-source",
      entry_headword: "circle",
      entry_kind: "word",
      entry_status: "draft",
      sense_id: "sense-source",
      sense_gloss: "圆圈",
      node_id: "relation-1",
      relation_type: "synonym"
    },
    ...overrides
  };
}

export function phraseComponentReference(
  target: {
    pos_id: string;
    form_id: string;
    variant_id: string;
    sense_id: string;
  },
  overrides: Partial<InboundReferenceV3> = {}
): InboundReferenceV3 {
  return {
    id: "phrase_component:component-1",
    kind: "phrase_component",
    target: { base_form_id: target.form_id, ...target },
    stale: false,
    source: {
      entry_id: "entry-phrase",
      entry_headword: "in orbit",
      entry_kind: "phrase",
      entry_status: "published",
      sense_id: "sense-phrase",
      sense_gloss: "在轨道上",
      node_id: "component-1"
    },
    ...overrides
  };
}

/** 按明细把 nodes 计数算出来（与后端口径一致：每条引用对每个目标节点计一次）。 */
export function inboundReferences(
  items: InboundReferenceV3[],
  overrides: Partial<InboundReferencesV3> = {}
): InboundReferencesV3 {
  const nodes = new Map<string, InboundReferenceNodeV3>();
  for (const item of items) {
    for (const nodeId of referenceTargetNodeIds(item)) {
      const node_type =
        nodeId === item.target.pos_id
          ? "pos"
          : nodeId === item.target.variant_id
            ? "variant"
            : nodeId === item.target.sense_id
              ? "sense"
              : "form";
      const node = nodes.get(nodeId) ?? {
        node_id: nodeId,
        node_type,
        total: 0
      };
      node.total += 1;
      nodes.set(nodeId, node);
    }
  }
  return {
    entry_id: "entry-1",
    revision: 1,
    nodes: [...nodes.values()],
    items,
    truncated: false,
    ...overrides
  };
}
