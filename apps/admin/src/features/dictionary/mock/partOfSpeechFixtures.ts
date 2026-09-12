import type {
  PartOfSpeechActor,
  PartOfSpeechCode,
  PartOfSpeechConfig,
  SubPartOfSpeechConfig
} from "@tsz/types";

const SYSTEM_ACTOR: PartOfSpeechActor = {
  id: "system",
  display_name: "系统"
};

/**
 * 后端固定的编码集合：只有这五个词性的释义必填细分词性。
 * 这是 mock 对后端派生规则的镜像，业务代码只能读 `sub_pos_required`，不得引用此集合。
 * 注意：挂细分词性不受此限，任意基本词性都可以扩展。
 */
const SUB_POS_REQUIRED_PART_CODES: ReadonlySet<PartOfSpeechCode> = new Set([
  "noun",
  "verb",
  "pronoun",
  "adjective",
  "adverb"
]);

export function isSubPosRequiredCode(code: PartOfSpeechCode): boolean {
  return SUB_POS_REQUIRED_PART_CODES.has(code);
}

// 种子只含五个基础词性（2026-09-06 拍板：介词、冠词等非基础种子不再保留）。
// [code, 正式中文, 正式英文, 英文缩写]；简洁显示 = 正式中文，英文全称 = code（与后端种子一致）。
const BASE_SEED = [
  ["noun", "名词", "NOUN", "n."],
  ["pronoun", "代词", "PRONOUN", "pron."],
  ["verb", "动词", "VERB", "v."],
  ["adjective", "形容词", "ADJECTIVE", "adj."],
  ["adverb", "副词", "ADVERB", "adv."]
] as const;

// 细分词性只种在五个基础词性下；非基础词性的同名种子已随规则下线。
// [parent, code, 正式中文, 正式英文, 英文缩写]；简洁显示 = 正式中文，英文全称 = 正式英文小写（与后端种子一致）。
const SUB_SEED = [
  ["verb", "V-T", "及物动词", "Transitive verb", "vt."],
  ["verb", "V-I", "不及物动词", "Intransitive verb", "vi."],
  ["verb", "V-LINK", "系动词", "Linking verb", "link.v."],
  ["verb", "AUX", "助动词", "Auxiliary verb", "aux."],
  ["verb", "MODAL", "情态动词", "Modal verb", "modal v."],
  ["adjective", "ADJ", "形容词", "Adjective", "adj."],
  ["adverb", "ADV", "副词", "Adverb", "adv."],
  ["noun", "N-COUNT", "可数名词", "Countable noun", "n."],
  ["noun", "N-UNCOUNT", "不可数名词", "Uncountable noun", "n."],
  ["noun", "N-PROPER", "专有名词", "Proper noun", "n."],
  ["noun", "N-PLURAL", "复数名词", "Plural noun", "n-pl."],
  ["noun", "N-SING", "单数名词", "Singular noun", "n."],
  ["pronoun", "PRON", "代词", "Pronoun", "pron."]
] as const;

export function createPartOfSpeechSeed(nowIso: string): {
  partsOfSpeech: PartOfSpeechConfig[];
  subParts: SubPartOfSpeechConfig[];
} {
  const partsOfSpeech = BASE_SEED.map(
    ([code, nameZh, nameEn, abbreviation], index): PartOfSpeechConfig => ({
      id: `pos-config-${code}`,
      kind: "word",
      code,
      name_zh: nameZh,
      name_en: nameEn,
      abbreviation,
      short_name_zh: nameZh,
      full_name_en: code,
      sort_order: (index + 1) * 10,
      usage_count: 0,
      sub_part_count: SUB_SEED.filter(([parent]) => parent === code).length,
      sub_parts_extensible: true,
      sub_pos_required: isSubPosRequiredCode(code),
      revision: 1,
      created_by: SYSTEM_ACTOR,
      created_at: nowIso,
      updated_at: nowIso
    })
  );
  const baseIdByCode = new Map(
    partsOfSpeech.map((item) => [item.code, item.id])
  );
  const subParts = SUB_SEED.map(
    (
      [parentCode, code, nameZh, nameEn, abbreviation],
      index
    ): SubPartOfSpeechConfig => ({
      id: `sub-pos-config-${code.toLocaleLowerCase("en")}`,
      part_of_speech_id: baseIdByCode.get(parentCode)!,
      code,
      name_zh: nameZh,
      name_en: nameEn,
      short_name_zh: nameZh,
      abbreviation,
      full_name_en: nameEn.toLocaleLowerCase("en"),
      sort_order: (index + 1) * 10,
      usage_count: 0,
      revision: 1,
      created_by: SYSTEM_ACTOR,
      created_at: nowIso,
      updated_at: nowIso
    })
  );
  return { partsOfSpeech, subParts };
}
