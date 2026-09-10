import type { PartOfSpeechCatalogResponse } from "@tsz/types";
import {
  createPartOfSpeechSeed,
  isSubPosRequiredCode
} from "../mock/partOfSpeechFixtures";

const seed = createPartOfSpeechSeed("2026-08-08T00:00:00.000Z");

const formCapabilities = {
  noun: ["plural"],
  verb: [
    "third_person_singular",
    "present_participle",
    "past_tense",
    "past_participle"
  ],
  // 默认种子把比较级与最高级分给形容词；这里副词也配了一份，模拟管理员按需
  // 在副词下补建或改挂之后的状态（归属是数据，不是代码常量）。
  adjective: ["comparative", "superlative"],
  adverb: ["comparative", "superlative"]
} as const;

export const partOfSpeechCatalogFixture: PartOfSpeechCatalogResponse = {
  catalog_version: 1,
  items: seed.partsOfSpeech.map((part) => ({
    id: part.id,
    code: part.code,
    name_zh: part.name_zh,
    name_en: part.name_en,
    abbreviation: part.abbreviation,
    short_name_zh: part.short_name_zh,
    full_name_en: part.full_name_en,
    sort_order: part.sort_order,
    allowed_form_types: [
      ...(formCapabilities[part.code as keyof typeof formCapabilities] ?? [])
    ],
    default_form_types: [
      ...(formCapabilities[part.code as keyof typeof formCapabilities] ?? [])
    ],
    sub_parts_extensible: part.sub_parts_extensible,
    sub_pos_required: isSubPosRequiredCode(part.code),
    sub_parts: seed.subParts
      .filter((subPart) => subPart.part_of_speech_id === part.id)
      .map((subPart) => ({
        id: subPart.id,
        code: subPart.code,
        name_zh: subPart.name_zh,
        name_en: subPart.name_en,
        short_name_zh: subPart.short_name_zh,
        abbreviation: subPart.abbreviation,
        full_name_en: subPart.full_name_en,
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
