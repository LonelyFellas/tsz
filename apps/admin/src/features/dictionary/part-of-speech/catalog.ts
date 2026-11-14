import type {
  AdminWordKind,
  FormTypeCatalogItem,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  PartOfSpeechCode,
  SubPartOfSpeechCatalogItem,
  SubPartOfSpeechCode
} from "@tsz/types";

export function createFormTypeComparator(
  formTypes: readonly FormTypeCatalogItem[] | undefined,
  posCatalog: PartOfSpeechCatalogItem | undefined
) {
  const configuredTypes = formTypes?.length
    ? [...formTypes]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => item.code)
    : posCatalog
      ? ["base", ...(posCatalog.allowed_form_types ?? [])]
      : [];
  const typeOrder = new Map(
    configuredTypes.map((type, index) => [type, index])
  );
  return (a: string, b: string) =>
    (typeOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
    (typeOrder.get(b) ?? Number.MAX_SAFE_INTEGER);
}

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
  kind?: AdminWordKind,
  interfaceLanguage = "zh-Hans"
) {
  const usedCodes = new Set(used);
  return lookup.items
    .filter((item) => !usedCodes.has(item.code))
    .filter((item) => !kind || item.kind === kind)
    .map((item) => ({
      value: item.code,
      label: localizedCatalogName(item, interfaceLanguage)
    }));
}

/** 仅选择目录已有的显示名，不转换目录内容或稳定编码。 */
export function localizedCatalogName(
  item: { name_zh: string; name_en: string },
  interfaceLanguage: string
) {
  return interfaceLanguage.startsWith("en")
    ? item.name_en || item.name_zh
    : item.name_zh;
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
