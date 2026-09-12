import type {
  AdminWordKind,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  PartOfSpeechCode,
  SubPartOfSpeechCatalogItem,
  SubPartOfSpeechCode,
  WordPosTag
} from "@tsz/types";

// 业务页面一律展示「简洁显示」，正式中文名只出现在词性配置页。
export interface PartOfSpeechLookup {
  formTypeNames: ReadonlyMap<string, string>;
  items: PartOfSpeechCatalogItem[];
  byCode: ReadonlyMap<PartOfSpeechCode, PartOfSpeechCatalogItem>;
  subPartByCode: ReadonlyMap<SubPartOfSpeechCode, SubPartOfSpeechCatalogItem>;
  subPartsByPosCode: ReadonlyMap<
    PartOfSpeechCode,
    SubPartOfSpeechCatalogItem[]
  >;
}

function stableSort<T extends { sort_order: number; id: string }>(
  items: readonly T[]
): T[] {
  return [...items].sort(
    (left, right) =>
      left.sort_order - right.sort_order || left.id.localeCompare(right.id)
  );
}

export function createPartOfSpeechLookup(
  catalog: PartOfSpeechCatalogResponse | undefined
): PartOfSpeechLookup {
  const items = stableSort(catalog?.items ?? []).map((item) => ({
    ...item,
    sub_parts: stableSort(item.sub_parts)
  }));
  const byCode = new Map(items.map((item) => [item.code, item]));
  const subPartByCode = new Map<
    SubPartOfSpeechCode,
    SubPartOfSpeechCatalogItem
  >();
  const subPartsByPosCode = new Map<
    PartOfSpeechCode,
    SubPartOfSpeechCatalogItem[]
  >();
  for (const item of items) {
    subPartsByPosCode.set(item.code, item.sub_parts);
    for (const subPart of item.sub_parts) {
      subPartByCode.set(subPart.code, subPart);
    }
  }
  return {
    items,
    byCode,
    subPartByCode,
    subPartsByPosCode,
    formTypeNames: new Map(catalog?.form_types?.map((f) => [f.code, f.name_zh]))
  };
}

export function partOfSpeechLabel(
  lookup: PartOfSpeechLookup,
  code: WordPosTag
): string {
  return lookup.byCode.get(code)?.name_zh ?? code;
}

export function subPartOfSpeechLabel(
  lookup: PartOfSpeechLookup,
  code: SubPartOfSpeechCode
): string {
  return lookup.subPartByCode.get(code)?.name_zh ?? code;
}

/**
 * 可选的基本词性。`kind` 给定时只列那一侧：单词词条挂短语词性（或反过来）会被后端
 * 以 `part_of_speech_kind_mismatch` 拒绝，不该让它出现在候选里。
 */
export function availablePartOfSpeechOptions(
  lookup: PartOfSpeechLookup,
  used: Iterable<PartOfSpeechCode> = [],
  kind?: AdminWordKind
) {
  const usedCodes = new Set(used);
  return lookup.items
    .filter((item) => !usedCodes.has(item.code))
    .filter((item) => !kind || item.kind === kind)
    .map((item) => ({ value: item.code, label: item.name_zh }));
}

export function subPartOfSpeechOptions(
  lookup: PartOfSpeechLookup,
  posCode: PartOfSpeechCode
) {
  return (lookup.subPartsByPosCode.get(posCode) ?? []).map((item) => ({
    value: item.code,
    label: item.name_zh
  }));
}

/**
 * 基本词性下只配置了一个细分项时返回它的编码。目录未加载或加载失败时
 * `subPartsByPosCode` 为空，返回 undefined，避免把「拿不到目录」误判成「只有一项」。
 */
export function soleSubPartOfSpeechCode(
  lookup: PartOfSpeechLookup,
  posCode: PartOfSpeechCode
): SubPartOfSpeechCode | undefined {
  const subParts = lookup.subPartsByPosCode.get(posCode) ?? [];
  return subParts.length === 1 ? subParts[0]!.code : undefined;
}

/**
 * 新建时排序值自动追加在末尾：现有最大排序值 + 10；空列表从 10 开始。
 * 基本词性按整个目录算，细分词性按所属基本词性下的列表算。
 */
export function nextSortOrder(
  items: readonly { sort_order: number }[]
): number {
  return items.reduce((max, item) => Math.max(max, item.sort_order), 0) + 10;
}
