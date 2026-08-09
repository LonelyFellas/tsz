import type {
  PartOfSpeechActor,
  PartOfSpeechConfig,
  SubPartOfSpeechConfig
} from "@tsz/types";

const SYSTEM_ACTOR: PartOfSpeechActor = {
  id: "system",
  display_name: "系统"
};

const BASE_SEED = [
  ["noun", "名词", "NOUN", "n."],
  ["pronoun", "代词", "PRONOUN", "pron."],
  ["verb", "动词", "VERB", "v."],
  ["adjective", "形容词", "ADJECTIVE", "adj."],
  ["adverb", "副词", "ADVERB", "adv."],
  ["preposition", "介词", "PREPOSITION", "prep."],
  ["article", "冠词", "ARTICLE", "art."],
  ["determiner", "限定词", "DETERMINER", "det."],
  ["conjunction", "连词", "CONJUNCTION", "conj."],
  ["numeral", "数词", "NUMERAL", "num."],
  ["interjection", "感叹词", "INTERJECTION", "int."]
] as const;

const SUB_SEED = [
  ["verb", "V-T", "及物动词", "Transitive verb"],
  ["verb", "V-I", "不及物动词", "Intransitive verb"],
  ["verb", "V-LINK", "系动词", "Linking verb"],
  ["verb", "AUX", "助动词", "Auxiliary verb"],
  ["verb", "MODAL", "情态动词", "Modal verb"],
  ["adjective", "ADJ", "形容词", "Adjective"],
  ["adverb", "ADV", "副词", "Adverb"],
  ["noun", "N-COUNT", "可数名词", "Countable noun"],
  ["noun", "N-UNCOUNT", "不可数名词", "Uncountable noun"],
  ["noun", "N-PROPER", "专有名词", "Proper noun"],
  ["noun", "N-PLURAL", "复数名词", "Plural noun"],
  ["noun", "N-SING", "单数名词", "Singular noun"],
  ["pronoun", "PRON", "代词", "Pronoun"],
  ["preposition", "PREP", "介词", "Preposition"],
  ["conjunction", "CONJ", "连词", "Conjunction"],
  ["determiner", "DET", "限定词", "Determiner"],
  ["article", "ART", "冠词", "Article"],
  ["numeral", "NUM", "数词", "Numeral"],
  ["interjection", "INT", "感叹词", "Interjection"]
] as const;

export function createPartOfSpeechSeed(nowIso: string): {
  partsOfSpeech: PartOfSpeechConfig[];
  subParts: SubPartOfSpeechConfig[];
} {
  const partsOfSpeech = BASE_SEED.map(
    ([code, nameZh, nameEn, abbreviation], index): PartOfSpeechConfig => ({
      id: `pos-config-${code}`,
      code,
      name_zh: nameZh,
      name_en: nameEn,
      abbreviation,
      sort_order: (index + 1) * 10,
      usage_count: 0,
      sub_part_count: SUB_SEED.filter(([parent]) => parent === code).length,
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
    ([parentCode, code, nameZh, nameEn], index): SubPartOfSpeechConfig => ({
      id: `sub-pos-config-${code.toLocaleLowerCase("en")}`,
      part_of_speech_id: baseIdByCode.get(parentCode)!,
      code,
      name_zh: nameZh,
      name_en: nameEn,
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
