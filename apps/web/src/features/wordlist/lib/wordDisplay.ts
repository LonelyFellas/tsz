// 词表展示模型 —— 把智能词库的词条树(AdminWord 同构 wire 形状)按
// 「显示密度 × 英式/美式」派生成表格可直接渲染的行模型。
// 纯函数,无 React;标签映射与 admin 编辑器(对接文档 §7)保持同一套中文措辞,
// 但形态是展示用(缩写/徽章),与编辑器下拉选项不通用,故不下沉 @tsz/shared,
// 待 C 端词条读取接口落地后再统一归位。
import type {
  AdminWord,
  AdminWordKind,
  CefrLevel,
  Dialect,
  GrammarStructure,
  RichText,
  WordForm,
  WordFormType,
  WordPosTag,
  WordSubPos
} from "@tsz/types";

/** 显示密度:简洁 / 标准 / 完整。 */
export type DisplayMode = "compact" | "standard" | "full";

/** 展示方言(词表页只提供英美二选,unified 词条走 common 兜底)。 */
export type ViewDialect = "uk" | "us";

export const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "compact", label: "简洁" },
  { value: "standard", label: "标准" },
  { value: "full", label: "完整" }
];

export const VIEW_DIALECT_OPTIONS: { value: ViewDialect; label: string }[] = [
  { value: "uk", label: "英式" },
  { value: "us", label: "美式" }
];

export const KIND_LABEL: Record<AdminWordKind, string> = {
  word: "单词",
  phrase: "词组"
};

/** 词性缩写(简洁/标准模式的「词性」列)。 */
export const POS_ABBR: Record<WordPosTag, string> = {
  noun: "n.",
  pronoun: "pron.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
  preposition: "prep.",
  article: "art.",
  determiner: "det.",
  conjunction: "conj.",
  numeral: "num.",
  interjection: "int."
};

/** 基本词性徽章(完整模式):英文大写 + 中文。 */
export const POS_CHIP: Record<WordPosTag, { en: string; zh: string }> = {
  noun: { en: "NOUN", zh: "名词" },
  pronoun: { en: "PRON", zh: "代词" },
  verb: { en: "VERB", zh: "动词" },
  adjective: { en: "ADJ", zh: "形容词" },
  adverb: { en: "ADV", zh: "副词" },
  preposition: { en: "PREP", zh: "介词" },
  article: { en: "ART", zh: "冠词" },
  determiner: { en: "DET", zh: "限定词" },
  conjunction: { en: "CONJ", zh: "连词" },
  numeral: { en: "NUM", zh: "数词" },
  interjection: { en: "INT", zh: "感叹词" }
};

/** 词形类别标签(base 不进「词形变化」列,原形在词条列展示)。 */
export const FORM_TYPE_LABEL: Record<WordFormType, string> = {
  base: "原形",
  present_participle: "现在分词",
  past_tense: "过去式",
  past_participle: "过去分词",
  third_person_singular: "第三人称单数",
  plural: "复数",
  comparative: "比较级",
  superlative: "最高级"
};

/** 细分词性标签(与 admin 编辑器同一对照表)。 */
export const SUB_POS_LABEL: Record<Exclude<WordSubPos, "">, string> = {
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

/** 徽章色调:词表页只区分三族——动词族(品红)、名词族(品牌蓝)、其余(中性)。 */
export type ChipTone = "verb" | "noun" | "neutral";

export const posChipTone = (pos: WordPosTag): ChipTone =>
  pos === "verb" ? "verb" : pos === "noun" ? "noun" : "neutral";

export const subPosChipTone = (subPos: WordSubPos): ChipTone => {
  if (subPos.startsWith("V-") || subPos === "AUX" || subPos === "MODAL") {
    return "verb";
  }
  return subPos.startsWith("N-") ? "noun" : "neutral";
};

/** CEFR 等级徽章色调:A 段品牌蓝,B 段紫,C 段中性深。 */
export type LevelTone = "a" | "b" | "c";

export const levelTone = (level: CefrLevel): LevelTone =>
  level.startsWith("A") ? "a" : level.startsWith("B") ? "b" : "c";

// ---------- 派生视图 ----------

export interface FormView {
  id: string;
  label: string;
  spelling: string;
  /** 词典音标(不带斜杠),无读音时为空串 */
  phonetic: string;
}

export interface DefLineView {
  id: string;
  level: CefrLevel;
  text: RichText;
  /** 释义指向的语法结构在当前方言下的措辞;未关联/悬空时为 null */
  grammar: RichText | null;
}

export interface SenseView {
  id: string;
  subPos: WordSubPos;
  subPosLabel: string;
  defLines: DefLineView[];
}

export interface PosView {
  id: string;
  pos: WordPosTag;
  abbr: string;
  chip: { en: string; zh: string };
  /** 非原形词形(完整模式「词形变化」列) */
  forms: FormView[];
  senses: SenseView[];
  /** 本词性下释义行总数(表格 rowSpan 用) */
  lineCount: number;
}

export interface WordView {
  id: string;
  kind: AdminWordKind;
  kindLabel: string;
  /** 当前方言下的原形拼写(取第一个词性的 base,缺失回退 headword) */
  headword: string;
  phonetic: string;
  pos: PosView[];
  lineCount: number;
}

/** 方言命中:优先精确匹配,unified 词条(或该方言缺块)回退 common。 */
const pickByDialect = <T extends { dialect: Dialect }>(
  items: T[],
  dialect: ViewDialect
): T[] => {
  const exact = items.filter((it) => it.dialect === dialect);
  return exact.length > 0
    ? exact
    : items.filter((it) => it.dialect === "common");
};

const firstPhonetic = (form: WordForm): string =>
  form.pronunciations[0]?.dict_phonetic ?? "";

const resolveGrammar = (
  structures: GrammarStructure[],
  id: string | undefined,
  dialect: ViewDialect
): RichText | null => {
  if (!id) return null;
  const structure = structures.find((s) => s.id === id);
  if (!structure) return null;
  return pickByDialect(structure.variants, dialect)[0]?.content ?? null;
};

/** 把一个词条树按方言拍平成表格视图。空词义/空词性直接剔除。 */
export function deriveWordView(
  word: AdminWord,
  dialect: ViewDialect
): WordView {
  const posViews: PosView[] = word.pos
    .map((p) => {
      const forms = pickByDialect(p.forms, dialect);
      const senses: SenseView[] = p.senses
        .filter((s) => s.definitions.length > 0)
        .map((s) => ({
          id: s.id,
          subPos: s.sub_pos,
          subPosLabel: s.sub_pos === "" ? "" : SUB_POS_LABEL[s.sub_pos],
          defLines: s.definitions.map((d) => ({
            id: d.id,
            level: d.level,
            text: d.text,
            grammar: resolveGrammar(
              p.grammar_structures,
              d.grammar_structure_id,
              dialect
            )
          }))
        }));

      return {
        id: p.id,
        pos: p.pos,
        abbr: POS_ABBR[p.pos],
        chip: POS_CHIP[p.pos],
        forms: forms
          .filter((f) => f.form_type !== "base")
          .map((f) => ({
            id: f.id,
            label: FORM_TYPE_LABEL[f.form_type],
            spelling: f.spelling,
            phonetic: firstPhonetic(f)
          })),
        senses,
        lineCount: senses.reduce((n, s) => n + s.defLines.length, 0)
      };
    })
    .filter((p) => p.lineCount > 0);

  const firstBase = word.pos
    .flatMap((p) => pickByDialect(p.forms, dialect))
    .find((f) => f.form_type === "base");

  return {
    id: word.id,
    kind: word.kind,
    kindLabel: KIND_LABEL[word.kind],
    headword: firstBase?.spelling ?? word.headword,
    phonetic: firstBase ? firstPhonetic(firstBase) : "",
    pos: posViews,
    lineCount: posViews.reduce((n, p) => n + p.lineCount, 0)
  };
}
