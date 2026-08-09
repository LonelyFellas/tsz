import type { PartOfSpeechCatalogResponse } from "@tsz/types";
import { createPartOfSpeechSeed } from "../mock/partOfSpeechFixtures";

const seed = createPartOfSpeechSeed("2026-08-08T00:00:00.000Z");

export const partOfSpeechCatalogFixture: PartOfSpeechCatalogResponse = {
  catalog_version: 1,
  items: seed.partsOfSpeech.map((part) => ({
    id: part.id,
    code: part.code,
    name_zh: part.name_zh,
    name_en: part.name_en,
    abbreviation: part.abbreviation,
    sort_order: part.sort_order,
    sub_parts: seed.subParts
      .filter((subPart) => subPart.part_of_speech_id === part.id)
      .map((subPart) => ({
        id: subPart.id,
        code: subPart.code,
        name_zh: subPart.name_zh,
        name_en: subPart.name_en,
        sort_order: subPart.sort_order
      }))
  }))
};

export function partOfSpeechCatalogQueryResult() {
  return {
    data: partOfSpeechCatalogFixture,
    isError: false,
    isPending: false,
    isLoading: false
  };
}
