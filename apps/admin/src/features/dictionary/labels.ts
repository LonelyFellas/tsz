// 智能词库 wire 枚举 ↔ UI 标签映射。提交值一律用 @tsz/types 的英文码,
// 中文/缩写仅用于展示(对接文档 §7 的对照表)。
import type {
  AdminWordKind,
  AdminWordStatus,
  CefrLevel,
  RelationReferenceSummaryV2,
  SurfaceMatchCategoryV2
} from "@tsz/types";

/** Record<wire 码, 标签> → antd Select options(码作 value,标签作 label)。 */
export const recordToOptions = <K extends string>(record: Record<K, string>) =>
  (Object.entries(record) as [K, string][]).map(([value, label]) => ({
    value,
    label
  }));

export const KIND_LABEL: Record<AdminWordKind, string> = {
  word: "单词",
  phrase: "短语"
};

export const KIND_OPTIONS = recordToOptions(KIND_LABEL);

export const STATUS_LABEL: Record<AdminWordStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

export const STATUS_OPTIONS = recordToOptions(STATUS_LABEL);

/**
 * 重复检测的命中原因。呈现次序固定为主词层面在前、词形层面在后——
 * 后端按匹配分数排序，混着看不出冲突的严重程度。
 */
export const MATCH_CATEGORY_ORDER: readonly SurfaceMatchCategoryV2[] = [
  "exact_headword",
  "cross_kind_headword",
  "form_headword",
  "headword_form",
  "form_form"
];

/** candidate 是本次要建的词，existing 是库里已有的，文案一律从「本次录入」的视角写。 */
export const MATCH_CATEGORY_LABEL: Record<SurfaceMatchCategoryV2, string> = {
  exact_headword: "主词相同",
  cross_kind_headword: "主词相同 · 跨词条类型",
  form_headword: "本次词形撞其主词",
  headword_form: "命中其词形",
  form_form: "词形相同"
};

/**
 * 后端新增命中类别时，前端未必同期发版（关联词维度正在后端排期）。
 * 落到白名单之外的码原样透出，让管理员至少看得见「命中了、但前端还不认识这个原因」，
 * 而不是静默当作没有命中原因——后者与 duplicate 分支本就不带原因的情形无法区分。
 */
export function matchCategoryLabel(category: SurfaceMatchCategoryV2): string {
  return MATCH_CATEGORY_LABEL[category] ?? category;
}

type RelationType = RelationReferenceSummaryV2["previews"][number]["relation"];

/** 关联类型。词面统一带「词」字：「同义词」而非「同义」。 */
export const RELATION_TYPE_LABEL: Record<RelationType, string> = {
  synonym: "同义词",
  antonym: "反义词",
  derivative: "派生词"
};

/** 同 `matchCategoryLabel`：wire 先于前端新增取值时原样透出，别渲染出 undefined。 */
export function relationTypeLabel(relation: RelationType): string {
  return RELATION_TYPE_LABEL[relation] ?? relation;
}

/**
 * 命中词条被哪些词条引用为关联词。
 *
 * 关联词在录入时若不在库中会被自动建成词条，因此下次录入同名词必然以 `exact_headword`
 * 命中它——但那条词条可能只是别人的近义词带出来的空壳，与管理员手工建的同名词条
 * 含义完全不同，必须让人当场看出来，否则会误判成「有人已经建过这个词了」。
 *
 * 计数取 `total`（全量），词面取 `previews`（后端截到 5 条的样本），
 * 所以只在恰好一条时才敢写出具体来源和类型。
 */
export function inboundRelationSummary(
  inbound?: RelationReferenceSummaryV2
): string | undefined {
  if (!inbound || inbound.total === 0) return undefined;
  const first = inbound.previews[0];
  // 恰好一条且样本齐全时才敢写具体来源与类型；样本多于一条说明 total 与样本不同步，
  // 按多条处理，宁可只报数量也不要以偏概全。
  if (inbound.total === 1 && first && inbound.previews.length === 1) {
    return `${first.source_headword} 的${relationTypeLabel(first.relation)}`;
  }
  // 措辞刻意避开「关联词」三字：主语是本词条（被别人引用），
  // 说成「N 个词条的关联词」会与「词条自身的关联词清单」混淆，那是两回事。
  if (first) {
    return `${first.source_headword} 等 ${inbound.total} 个词条`;
  }
  return `${inbound.total} 个词条`;
}

export const CEFR_LEVELS: readonly CefrLevel[] = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2"
];

export const CEFR_OPTIONS = CEFR_LEVELS.map((v) => ({ value: v, label: v }));

export const CEFR_COLOR: Record<CefrLevel, string> = {
  A1: "#4CCB4B",
  A2: "#00A5CC",
  B1: "#2053FF",
  B2: "#7E2BF8",
  C1: "#B817CF",
  C2: "#D22D8D"
};

/** CEFR 六档独立着色，便于一眼识别具体等级。 */
export function cefrColor(level: CefrLevel): string {
  return CEFR_COLOR[level];
}
