import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  InboundReferenceV3,
  InboundReferencesV3,
  WordConcreteFormV3,
  WordFormGroupV3,
  WordPosFormsV3
} from "@tsz/types";
import { normalizeSentenceSurface } from "@/features/sentences/associationModel";
import type { V3IssueNavigationTarget } from "./issueNavigation";

/**
 * 被引用节点保护的纯判定：把 GET inbound-references 的响应建成索引，各编辑控件据此
 * 决定禁用与徽标。禁用只算未失效的引用（见 nodesBlockingReferenceCount），徽标与列表显示全部；
 * 明细最多 500 条。
 * 本地新增、尚未保存的节点不在索引里，天然不受限。
 */
export type V3ReferenceGuardStatus = "loaded" | "loading" | "unavailable";

export interface V3ReferenceIndex {
  status: V3ReferenceGuardStatus;
  revision?: number;
  /** node_id → 指向它的引用完整计数。 */
  counts: ReadonlyMap<string, number>;
  /** node_id → 明细（可能被截断）。 */
  byNode: ReadonlyMap<string, readonly InboundReferenceV3[]>;
  /** node_id → 明细里指向它的失效引用数；明细被截断时从完整计数里扣掉失效项用。 */
  staleCounts: ReadonlyMap<string, number>;
  items: readonly InboundReferenceV3[];
  stale: readonly InboundReferenceV3[];
  truncated: boolean;
}

export function referenceTargetNodeIds(
  reference: InboundReferenceV3
): string[] {
  const { pos_id, base_form_id, form_id, variant_id, sense_id } =
    reference.target;
  return [
    ...new Set(
      [pos_id, base_form_id, form_id, variant_id, sense_id].filter(
        (id): id is string => typeof id === "string"
      )
    )
  ];
}

export function buildReferenceIndex(
  response: InboundReferencesV3 | undefined,
  status: V3ReferenceGuardStatus = response ? "loaded" : "loading"
): V3ReferenceIndex {
  const counts = new Map<string, number>();
  const byNode = new Map<string, InboundReferenceV3[]>();
  const staleCounts = new Map<string, number>();
  for (const node of response?.nodes ?? []) {
    counts.set(node.node_id, node.total);
  }
  for (const item of response?.items ?? []) {
    for (const nodeId of referenceTargetNodeIds(item)) {
      const bucket = byNode.get(nodeId);
      if (bucket) bucket.push(item);
      else byNode.set(nodeId, [item]);
      if (item.stale)
        staleCounts.set(nodeId, (staleCounts.get(nodeId) ?? 0) + 1);
    }
  }
  return {
    status,
    ...(response ? { revision: response.revision } : {}),
    counts,
    byNode,
    staleCounts,
    items: response?.items ?? [],
    stale: (response?.items ?? []).filter((item) => item.stale),
    truncated: response?.truncated ?? false
  };
}

export const EMPTY_REFERENCE_INDEX: V3ReferenceIndex = buildReferenceIndex(
  undefined,
  "loaded"
);

/** 指向这批节点的引用明细（去重，可能因截断少于计数）。 */
export function referencesForNodes(
  index: V3ReferenceIndex,
  nodeIds: readonly string[]
): InboundReferenceV3[] {
  const seen = new Set<string>();
  const result: InboundReferenceV3[] = [];
  for (const nodeId of nodeIds) {
    for (const reference of index.byNode.get(nodeId) ?? []) {
      if (seen.has(reference.id)) continue;
      seen.add(reference.id);
      result.push(reference);
    }
  }
  return result;
}

/**
 * 指向这批节点的引用数。明细完整时按引用去重；被截断时无法跨节点去重，
 * 取单节点计数的最大值——宁可少报也不能把「有引用」报成 0。
 */
export function nodesReferenceCount(
  index: V3ReferenceIndex,
  nodeIds: readonly string[]
): number {
  if (!index.truncated) return referencesForNodes(index, nodeIds).length;
  return nodeIds.reduce(
    (max, nodeId) => Math.max(max, index.counts.get(nodeId) ?? 0),
    0
  );
}

/**
 * 会挡住编辑的引用数：只算未失效的。草稿保存只拦本次改动破坏的引用，已失效的旧引用改不改都
 * 不挡保存（只挡发布），把它算进锁里反而会挡住本地修复。明细被截断时用单节点完整计数减去明细
 * 里的失效条数兜底（后端把失效项排在前面），同样取最大值。徽标与列表照常用全部引用。
 */
export function nodesBlockingReferenceCount(
  index: V3ReferenceIndex,
  nodeIds: readonly string[]
): number {
  if (!index.truncated) {
    return referencesForNodes(index, nodeIds).filter(
      (reference) => !reference.stale
    ).length;
  }
  return nodeIds.reduce(
    (max, nodeId) =>
      Math.max(
        max,
        (index.counts.get(nodeId) ?? 0) - (index.staleCounts.get(nodeId) ?? 0)
      ),
    0
  );
}

export function variantIdsOf(form: WordConcreteFormV3): string[] {
  return form.regional_variants.mode === "common"
    ? [form.regional_variants.common.id]
    : [form.regional_variants.uk.id, form.regional_variants.us.id];
}

/** 词形本身加它的变体：删词形、改词形类型都按这一组节点判定。 */
export function formNodeIds(form: WordConcreteFormV3): string[] {
  return [form.id, ...variantIdsOf(form)];
}

export function formReferenceCount(
  index: V3ReferenceIndex,
  form: WordConcreteFormV3
): number {
  return nodesBlockingReferenceCount(index, formNodeIds(form));
}

/** 词性下已保存的全部节点；词义 id 由词义步另传（词形步拿不到）。 */
export function posNodeIds(
  pos: WordPosFormsV3,
  senseIds: readonly string[] = []
): string[] {
  return [pos.pos_id, ...pos.forms.flatMap(formNodeIds), ...senseIds];
}

export function posReferenceCount(
  index: V3ReferenceIndex,
  pos: WordPosFormsV3,
  senseIds: readonly string[] = []
): number {
  return nodesBlockingReferenceCount(index, posNodeIds(pos, senseIds));
}

function groupForms(
  pos: WordPosFormsV3,
  group: WordFormGroupV3
): WordConcreteFormV3[] {
  return group.members.flatMap((member) => {
    const form = pos.forms.find((item) => item.id === member.form_id);
    return form ? [form] : [];
  });
}

/** 删变化组会连带删掉只属于本组的词形；一个词形只属于一个组，按全部成员判定。 */
export function groupDeleteReferenceCount(
  index: V3ReferenceIndex,
  pos: WordPosFormsV3,
  group: WordFormGroupV3
): number {
  return nodesBlockingReferenceCount(
    index,
    groupForms(pos, group).flatMap(formNodeIds)
  );
}

export interface V3DialectRuleLocks {
  /** 指向英美通用变体的引用数：拆成英 / 美会换掉变体 id。 */
  split: number;
  /** 指向英式 / 美式变体的引用数：合并成英美通用会丢掉它们。 */
  merge: number;
}

/**
 * 英美规则切换只在改变 common ↔ uk_us 结构时才会破坏引用；uk_us 内部只改拼写模式
 * 不换变体 id，改坏拼写由拼写一致性校验兜底。
 */
export function dialectRuleLocks(
  index: V3ReferenceIndex,
  pos: WordPosFormsV3,
  group: WordFormGroupV3
): V3DialectRuleLocks {
  const forms = groupForms(pos, group);
  const variantIds = (mode: "common" | "uk_us") =>
    forms
      .filter((form) => form.regional_variants.mode === mode)
      .flatMap(variantIdsOf);
  return {
    split: nodesBlockingReferenceCount(index, variantIds("common")),
    merge: nodesBlockingReferenceCount(index, variantIds("uk_us"))
  };
}

export function senseReferenceCount(
  index: V3ReferenceIndex,
  senseId: string
): number {
  return nodesBlockingReferenceCount(index, [senseId]);
}

export interface V3SpellingConflict {
  posId: string;
  formId: string;
  variantId: string;
  spelling: string;
  references: InboundReferenceV3[];
}

function segmentLiteral(reference: InboundReferenceV3): string | undefined {
  const segments = reference.source.segments;
  if (!segments?.length) return undefined;
  return segments.map((segment) => segment.surface).join(" ");
}

/** 与后端 `normalize_headword` 的 key 同口径：NFKC、折叠空白、弯引号 / 连字号归一、小写。 */
export function normalizeSpelling(value: string): string {
  return normalizeSentenceSurface(value);
}

/**
 * 变体拼写与多维例句标注片段规范化后是否对不上（Q2）。短语成分不比对拼写文案，
 * 只有例句标注会因拼写改动失效。
 */
export function spellingConflictReferences(
  index: V3ReferenceIndex,
  variantIds: readonly string[],
  spelling: string
): InboundReferenceV3[] {
  const normalized = normalizeSpelling(spelling);
  return referencesForNodes(index, variantIds).filter((reference) => {
    if (reference.kind !== "shared_sentence") return false;
    if (!variantIds.includes(reference.target.variant_id ?? "")) return false;
    const literal = segmentLiteral(reference);
    return literal !== undefined && normalizeSpelling(literal) !== normalized;
  });
}

export function spellingConflicts(
  index: V3ReferenceIndex,
  forms: DraftFormsStepContentV3
): V3SpellingConflict[] {
  const conflicts: V3SpellingConflict[] = [];
  for (const pos of forms.pos) {
    for (const form of pos.forms) {
      const variants =
        form.regional_variants.mode === "common"
          ? [form.regional_variants.common]
          : [form.regional_variants.uk, form.regional_variants.us];
      for (const variant of variants) {
        const references = spellingConflictReferences(
          index,
          [variant.id],
          variant.spelling
        );
        if (references.length > 0) {
          conflicts.push({
            posId: pos.pos_id,
            formId: form.id,
            variantId: variant.id,
            spelling: variant.spelling,
            references
          });
        }
      }
    }
  }
  return conflicts;
}

export function staleReferences(
  index: V3ReferenceIndex
): readonly InboundReferenceV3[] {
  return index.stale;
}

export type V3ReferenceLink =
  | {
      kind: "local_sentence";
      senseId: string;
      posId?: string;
      sentenceId: string;
      libraryHref: string;
    }
  | { kind: "sentence_library"; href: string }
  | { kind: "entry"; href: string; entryId: string }
  | { kind: "none" };

/** 每条引用的去处：同词条例句就地打开（例句库作备用），其余在新标签页打开来源词条并定位。 */
export function referenceLink(reference: InboundReferenceV3): V3ReferenceLink {
  const { source, target } = reference;
  if (reference.kind === "shared_sentence") {
    if (!source.sentence_id) return { kind: "none" };
    const libraryHref = `/sentences?sentence=${encodeURIComponent(source.sentence_id)}`;
    if (!target.sense_id)
      return { kind: "sentence_library", href: libraryHref };
    return {
      kind: "local_sentence",
      senseId: target.sense_id,
      ...(target.pos_id ? { posId: target.pos_id } : {}),
      sentenceId: source.sentence_id,
      libraryHref
    };
  }
  if (!source.entry_id) return { kind: "none" };
  const step =
    reference.kind === "form_group_sense_binding" ||
    (reference.kind === "phrase_component" && !source.sense_id)
      ? "forms"
      : "meanings";
  const params = new URLSearchParams();
  if (source.entry_status === "published") params.set("mode", "edit");
  if (source.node_id) params.set("focus_node", source.node_id);
  const query = params.toString();
  return {
    kind: "entry",
    entryId: source.entry_id,
    href: `/words/${source.entry_id}/v3/wizard/${step}${query ? `?${query}` : ""}`
  };
}

function containsNodeId(value: unknown, nodeId: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsNodeId(item, nodeId));
  }
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.id === nodeId) return true;
  return Object.values(record).some((item) => containsNodeId(item, nodeId));
}

/**
 * 按节点 id 在词条里定位可聚焦的锚点：词形步落到词形类型 / 拼写输入框，
 * 词义步落到词义卡片（关联、成分、正文关联都在卡片里）。找不到返回 undefined。
 */
export function locateV3Node(
  word: Pick<AdminWordV3, "forms" | "meanings">,
  nodeId: string
): V3IssueNavigationTarget | undefined {
  for (const pos of word.forms.pos) {
    if (pos.pos_id === nodeId) {
      return {
        step: "forms",
        node_id: nodeId,
        field: "pos",
        pos_id: pos.pos_id,
        ancestor_node_ids: []
      };
    }
    for (const form of pos.forms) {
      const group = pos.form_groups.find((candidate) =>
        candidate.members.some((member) => member.form_id === form.id)
      );
      const membership = group?.members.find(
        (member) => member.form_id === form.id
      );
      const scope = {
        pos_id: pos.pos_id,
        ...(group ? { form_group_id: group.id } : {}),
        ...(membership ? { membership_id: membership.id } : {}),
        form_id: form.id,
        ancestor_node_ids: [pos.pos_id, ...(group ? [group.id] : [])]
      };
      if (form.id === nodeId) {
        return {
          step: "forms",
          node_id: form.id,
          field: "form_type",
          ...scope
        };
      }
      const variants =
        form.regional_variants.mode === "common"
          ? [form.regional_variants.common]
          : [form.regional_variants.uk, form.regional_variants.us];
      for (const variant of variants) {
        if (variant.id === nodeId || containsNodeId(variant, nodeId)) {
          return {
            step: "forms",
            node_id: variant.id,
            field: "spelling",
            variant_id: variant.id,
            dialect: variant.dialect,
            ...scope
          };
        }
      }
    }
  }
  for (const pos of word.meanings.pos) {
    for (const sense of pos.senses) {
      if (sense.id === nodeId || containsNodeId(sense, nodeId)) {
        return {
          step: "meanings",
          node_id: sense.id,
          field: "sense",
          pos_id: pos.pos_id,
          ancestor_node_ids: [pos.pos_id]
        };
      }
    }
  }
  return undefined;
}
