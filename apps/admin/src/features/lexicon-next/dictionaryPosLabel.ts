import type {
  NextDictionaryPosMapping,
  PartOfSpeechCatalogItem
} from "@tsz/types";
import { localizedCatalogName } from "@/features/dictionary/part-of-speech/catalog";

const BASIC_PART_OF_SPEECH_CODES = new Set([
  "noun",
  "pronoun",
  "verb",
  "adjective",
  "adverb"
]);

/**
 * Built-in dictionary matches may contain provider-specific English POS codes.
 * Use the catalog label for configured basic/custom POS values and keep an
 * unconfigured source code visible so it remains auditable.
 */
export function dictionaryMatchPosLabel(
  code: string,
  catalog: readonly PartOfSpeechCatalogItem[] | undefined,
  label: (value: string) => string,
  interfaceLocale = "zh-Hans",
  mapping?: NextDictionaryPosMapping
): string {
  const normalized = code.trim();
  const item = catalog?.find(
    (candidate) => candidate.code === (mapping?.part_of_speech ?? normalized)
  );
  if (item) {
    const subPart = item.sub_parts?.find(
      (part) => part.code === mapping?.sub_pos
    );
    return localizedCatalogName(subPart ?? item, interfaceLocale);
  }
  if (catalog === undefined && BASIC_PART_OF_SPEECH_CODES.has(normalized)) {
    return label(normalized);
  }
  return normalized;
}
