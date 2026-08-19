import type {
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  PartOfSpeechCode,
  SubPartOfSpeechCatalogItem,
  SubPartOfSpeechCode,
  WordPosTag
} from "@tsz/types";

export interface PartOfSpeechLookup {
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
  return { items, byCode, subPartByCode, subPartsByPosCode };
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

export function availablePartOfSpeechOptions(
  lookup: PartOfSpeechLookup,
  used: Iterable<PartOfSpeechCode> = []
) {
  const usedCodes = new Set(used);
  return lookup.items
    .filter((item) => !usedCodes.has(item.code))
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
