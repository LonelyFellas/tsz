import type {
  AdminWordStatus,
  Dialect,
  FormsImpactNodeTypeV3,
  PronunciationStyle,
  V3PublicationBlockCode,
  WordFormTypeV3
} from "@tsz/types";

const FORM_TYPE_LABEL: Record<WordFormTypeV3, string> = {
  base: "原形",
  third_person_singular: "第三人称单数",
  present_participle: "现在分词",
  past_tense: "过去式",
  past_participle: "过去分词",
  plural: "复数",
  comparative: "比较级",
  superlative: "最高级"
};

const DIALECT_LABEL: Record<Dialect, string> = {
  common: "通用",
  uk: "英式",
  us: "美式"
};

const PRONUNCIATION_STYLE_LABEL: Record<PronunciationStyle, string> = {
  normal: "常规",
  strong: "强读",
  weak: "弱读"
};

const PART_OF_SPEECH_LABEL: Record<string, string> = {
  noun: "名词",
  pronoun: "代词",
  verb: "动词",
  adjective: "形容词",
  adverb: "副词",
  preposition: "介词",
  article: "冠词",
  determiner: "限定词",
  conjunction: "连词",
  numeral: "数词",
  interjection: "感叹词"
};

const SUB_PART_OF_SPEECH_LABEL: Record<string, string> = {
  "V-T": "及物动词",
  "V-I": "不及物动词",
  "V-LINK": "系动词",
  AUX: "助动词",
  MODAL: "情态动词",
  ADJ: "形容词",
  ADV: "副词",
  "N-COUNT": "可数名词",
  "N-UNCOUNT": "不可数名词",
  "N-PROPER": "专有名词",
  "N-PLURAL": "复数名词",
  "N-SING": "单数名词",
  PRON: "代词",
  PREP: "介词",
  CONJ: "连词",
  DET: "限定词",
  ART: "冠词",
  NUM: "数词",
  INT: "感叹词"
};

const RELATION_LABEL: Record<string, string> = {
  synonym: "近义词",
  antonym: "反义词",
  derivative: "派生词",
  derived: "派生词"
};

const IMPACT_LABEL: Record<FormsImpactNodeTypeV3, string> = {
  pos: "词性",
  form_group: "词形变化组",
  membership: "词形使用位置",
  form: "词形",
  variant: "地区拼写",
  pronunciation: "发音",
  phrase_component_usage: "成分用词",
  surface: "公开词面",
  publication: "发布内容",
  grammar_structure: "语法结构",
  text_variant: "文本内容",
  sense: "词义",
  definition: "释义",
  sentence: "例句",
  relation: "词义关系"
};

export function wordStatusLabel(status: AdminWordStatus): string {
  return {
    draft: "草稿",
    published: "已发布",
    archived: "垃圾桶"
  }[status];
}

export function formTypeLabel(value: WordFormTypeV3): string {
  return FORM_TYPE_LABEL[value] ?? "未识别词形类型";
}

export function dialectLabel(value: Dialect): string {
  return DIALECT_LABEL[value] ?? "未识别地区";
}

export function pronunciationStyleLabel(value: PronunciationStyle): string {
  return PRONUNCIATION_STYLE_LABEL[value] ?? "未识别发音方式";
}

export function partOfSpeechLabel(value: string): string {
  return PART_OF_SPEECH_LABEL[value] ?? "其他词性";
}

export function subPartOfSpeechLabel(value: string): string {
  return SUB_PART_OF_SPEECH_LABEL[value] ?? "其他细分词性";
}

export function relationLabel(value: string): string {
  return RELATION_LABEL[value] ?? "其他关系";
}

export function sentenceLinkRoleLabel(value: string): string {
  if (value === "focus" || value === "head") return "主关联";
  if (value === "context") return "上下文关联";
  return "其他关联";
}

export function impactReasonLabel(value: string): string {
  return /[\u3400-\u9fff]/u.test(value)
    ? value
    : "关联内容将随本次调整受到影响。";
}

export function impactTypeLabel(value: FormsImpactNodeTypeV3): string {
  return IMPACT_LABEL[value] ?? "受影响内容";
}

export function publicationBlockMessage(code: V3PublicationBlockCode): string {
  return code === "phase2_consumers_not_ready"
    ? "学习端尚未完成该词条结构的发布准备。"
    : "该词条暂未进入允许发布的迁移范围。";
}

export function definitionModeLabel(value: string): string {
  return (
    {
      zh_definition: "中文释义",
      zh_sentence: "中文例句",
      en_definition: "英文释义",
      en_sentence: "英文例句"
    }[value] ?? "未识别内容方式"
  );
}
