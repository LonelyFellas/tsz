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
  // 与迁移 20260910120000 的默认分配一致：比较级与最高级归形容词，副词名下为空。
  // 词形编码全局唯一，两个词性不可能同时含 comparative。
  adjective: ["comparative", "superlative"],
  adverb: []
} as const;

const formTypeNameZh: Record<string, string> = {
  base: "原形",
  third_person_singular: "第三人称单数",
  present_participle: "现在分词",
  past_tense: "过去式",
  past_participle: "过去分词",
  plural: "复数",
  comparative: "比较级",
  superlative: "最高级"
};

// 词形目录：原形对所有词性通用，其余按上面的分配挂在各自词性下。
const formTypeSeed: readonly (readonly [string, string | undefined])[] = [
  ["base", undefined],
  ...Object.entries(formCapabilities).flatMap(([posCode, codes]) =>
    codes.map((code) => [code, posCode] as const)
  )
];

export const partOfSpeechCatalogFixture: PartOfSpeechCatalogResponse = {
  catalog_version: 1,
  form_types: formTypeSeed.map(([code, posCode], index) => ({
    id: `form-type-${code}`,
    ...(posCode
      ? {
          part_of_speech_id: seed.partsOfSpeech.find(
            (part) => part.code === posCode
          )!.id
        }
      : {}),
    code,
    name_zh: formTypeNameZh[code] ?? code,
    name_en: code,
    short_name_zh: formTypeNameZh[code] ?? code,
    abbreviation: code,
    full_name_en: code,
    sort_order: index * 10
  })),
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
