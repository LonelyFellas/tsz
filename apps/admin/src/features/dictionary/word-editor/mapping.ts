// wire 词条树(@tsz/types) ↔ 编辑器表单模型 的双向映射。
//
// 表单模型是前端本地 state(camelCase),枚举值直接用 wire 英文码,展示才转中文。
// 对接文档 §3.3 的硬约定在这里落实:
// - 节点 id 由前端生成(UUID v4)且跨保存稳定:所有「增行」默认值都当场带 id,
//   fromWire 原样保留服务端 id,toWire 原样带回——绝不重新生成;
// - audio_url/audio_source 与关联词快照是服务端自有字段:fromWire 保留在行模型里
//   (试听要用),toWire 不发(发了也会被忽略,少传省体积);
// - 富文本按「文本未改则原样保留 spans/liaisons,改了则清空标记」处理,
//   编辑器暂不支持标记编辑,不能让过期偏移量污染数据(越界会 400)。
import type {
  AdminWord,
  AdminWordSaveInput,
  CefrLevel,
  Dialect,
  DialectMode,
  GrammarStructure,
  PronunciationStyle,
  RichText,
  SenseGroup,
  WordForm,
  WordFormType,
  WordPos,
  WordPosTag,
  WordRelation,
  WordSense,
  WordSubPos
} from "@tsz/types";
import { RELATION_GROUPS, type RelationGroupKey } from "../editorConstants";

// crypto.randomUUID 只在安全上下文(HTTPS/localhost)存在,tshb-test 是裸 IP HTTP,
// 必须用 getRandomValues(不受安全上下文限制)手拼 UUID v4 兜底,否则编辑页整页崩。
export const newId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// —— 表单模型 ————————————————————————————————————————————————————————————————

/** 词形变化的一行 = 一个读音;同块内相邻且「类别+拼写」相同的行合并为一个 Form。 */
export interface InflectionRow {
  formId: string;
  pronId: string;
  /** 首行固定 base;其余行可选类别 */
  category: WordFormType;
  spelling?: string;
  /** 字典音标 dict_phonetic */
  ipa?: string;
  /** 实际发音 actual_pron */
  phonetic?: string;
  style: PronunciationStyle;
  /** 只读:服务端音频,按 id 保留 */
  audioUrl?: string;
}

/** 语法结构一行:每个方言一条措辞;variantIds/variantRich 是隐藏簿记(非表单控件)。 */
export interface GrammarRow {
  id: string;
  /** 按方言的措辞文本(表单控件路径 [name, "texts", dialect]) */
  texts: Partial<Record<Dialect, string>>;
  /** 各方言措辞的节点 id(保留服务端 id) */
  variantIds: Partial<Record<Dialect, string>>;
  /** 各方言措辞的原始富文本(文本未改时原样带回 spans) */
  variantRich: Partial<Record<Dialect, RichText>>;
}

export interface DefinitionRow {
  id: string;
  level: CefrLevel;
  defType: "zh" | "en";
  text: string;
  /** 绑定的语法结构 id(同一 pos 下) */
  grammarId?: string;
  rich?: RichText;
  audioUrl?: string;
}

export interface ExampleRow {
  id: string;
  text: string;
  sourceExampleId?: string;
  rich?: RichText;
  audioUrl?: string;
}

/** 关联词一行:目标经 related-search 选定;孤儿(双 null)只剩快照,原样带回。 */
export interface RelationRow {
  id: string;
  targetWordId?: string;
  targetSenseId?: string;
  targetHeadword?: string;
  targetGloss?: string;
  score?: number;
}

export interface SenseValue {
  id: string;
  level: CefrLevel;
  subPos?: WordSubPos;
  senseGroupId?: string;
  frequency?: number;
  contextDependent: boolean;
  definitions: DefinitionRow[];
  examples: ExampleRow[];
  synonyms: RelationRow[];
  antonyms: RelationRow[];
  derivatives: RelationRow[];
}

export interface PosTabValue {
  id: string;
  pos: WordPosTag;
  /** 按方言分块的词形行(uk / us / common) */
  inflections: Partial<Record<Dialect, InflectionRow[]>>;
  grammar: GrammarRow[];
  senses: SenseValue[];
}

export interface SenseRangeRow {
  id: string;
  name: string;
}

export interface EditorFormValues {
  frequency?: number;
  dialectMode: DialectMode;
  dialects: Dialect[];
  senseRanges: SenseRangeRow[];
  posList: PosTabValue[];
}

// —— 默认值工厂(新增 Tab/行时填充;每次全新对象 + 现场发 id)——————————————————————

export function defaultInflectionRow(
  category: WordFormType = "base"
): InflectionRow {
  return { formId: newId(), pronId: newId(), category, style: "normal" };
}

export function defaultGrammarRow(): GrammarRow {
  return { id: newId(), texts: {}, variantIds: {}, variantRich: {} };
}

export function defaultDefinition(): DefinitionRow {
  return { id: newId(), level: "A1", defType: "zh", text: "" };
}

export function defaultExample(): ExampleRow {
  return { id: newId(), text: "" };
}

export function defaultRelation(): RelationRow {
  return { id: newId() };
}

export function defaultSense(wordFrequency?: number): SenseValue {
  return {
    id: newId(),
    level: "A1",
    // 交互约定(文档 §6):新建词义默认带出词条词频,可改。
    frequency: wordFrequency,
    contextDependent: false,
    definitions: [defaultDefinition()],
    examples: [defaultExample()],
    synonyms: [],
    antonyms: [],
    derivatives: []
  };
}

export function defaultPos(
  pos: WordPosTag,
  wordFrequency?: number
): PosTabValue {
  // 每个方言 + common 兜底块各预置一条「原形」行,切到任一模式都有起始行。
  const inflections = Object.fromEntries(
    (["uk", "us", "common"] as const).map((d) => [d, [defaultInflectionRow()]])
  );
  return {
    id: newId(),
    pos,
    inflections,
    grammar: [defaultGrammarRow()],
    senses: [defaultSense(wordFrequency)]
  };
}

// —— 富文本 ———————————————————————————————————————————————————————————————————

/** 文本未改 → 原样保留标记;改了 → 标记清空(偏移量已失效,带回会 400)。 */
export function toRichText(text: string, original?: RichText): RichText {
  if (original && original.text === text) return original;
  return { version: 1, text, spans: [], liaisons: [] };
}

// —— 词频:wire 百分数字符串("0.500000") ↔ 表单 number ————————————————————————

export function frequencyToNumber(freq?: string): number | undefined {
  if (freq === undefined || freq === "") return undefined;
  const n = Number(freq);
  return Number.isFinite(n) ? n : undefined;
}

export function frequencyToWire(freq?: number | null): string {
  return freq === undefined || freq === null ? "" : String(freq);
}

// —— fromWire:整棵树 → 表单值 —————————————————————————————————————————————————

function formsToRows(forms: WordForm[]): InflectionRow[] {
  // base 词形排最前(UI 首行固定为原形),其余保持服务端顺序。
  const ordered = [
    ...forms.filter((f) => f.form_type === "base"),
    ...forms.filter((f) => f.form_type !== "base")
  ];
  const rows: InflectionRow[] = [];
  for (const f of ordered) {
    if (f.pronunciations.length === 0) {
      rows.push({
        formId: f.id,
        pronId: newId(),
        category: f.form_type,
        spelling: f.spelling,
        style: "normal"
      });
      continue;
    }
    for (const p of f.pronunciations) {
      rows.push({
        formId: f.id,
        pronId: p.id,
        category: f.form_type,
        spelling: f.spelling,
        ipa: p.dict_phonetic,
        phonetic: p.actual_pron,
        style: p.style,
        audioUrl: p.audio_url
      });
    }
  }
  return rows.length > 0 ? rows : [defaultInflectionRow()];
}

function grammarToRow(g: GrammarStructure): GrammarRow {
  const row = defaultGrammarRow();
  row.id = g.id;
  for (const v of g.variants) {
    row.texts[v.dialect] = v.content.text;
    row.variantIds[v.dialect] = v.id;
    row.variantRich[v.dialect] = v.content;
  }
  return row;
}

function relationsToGroups(
  relations: WordRelation[]
): Pick<SenseValue, RelationGroupKey> {
  const groups: Pick<SenseValue, RelationGroupKey> = {
    synonyms: [],
    antonyms: [],
    derivatives: []
  };
  for (const r of relations) {
    const group = RELATION_GROUPS.find((g) => g.relation === r.relation);
    if (!group) continue;
    groups[group.key].push({
      id: r.id,
      targetWordId: r.target_word_id,
      targetSenseId: r.target_sense_id,
      targetHeadword: r.target_headword,
      targetGloss: r.target_gloss,
      score: r.score
    });
  }
  return groups;
}

function senseToValue(s: WordSense): SenseValue {
  return {
    id: s.id,
    level: s.level,
    subPos: s.sub_pos === "" ? undefined : s.sub_pos,
    senseGroupId: s.sense_group_id,
    frequency: frequencyToNumber(s.frequency),
    contextDependent: s.depends_on_context,
    definitions: s.definitions.map((d) => ({
      id: d.id,
      level: d.level,
      defType: d.def_type,
      text: d.text.text,
      grammarId: d.grammar_structure_id,
      rich: d.text,
      audioUrl: d.audio_url
    })),
    examples: s.sentences.map((x) => ({
      id: x.id,
      text: x.text?.text ?? "",
      sourceExampleId: x.source_example_id,
      rich: x.text,
      audioUrl: x.audio_url
    })),
    ...relationsToGroups(s.relations)
  };
}

export function fromWire(word: AdminWord): EditorFormValues {
  const enabled: Dialect[] =
    word.dialect_mode === "distinguish" ? word.dialects : ["common"];
  const posList = word.pos.map((p): PosTabValue => {
    const inflections: PosTabValue["inflections"] = {};
    for (const d of enabled) {
      inflections[d] = formsToRows(p.forms.filter((f) => f.dialect === d));
    }
    // 未启用方言也预置起始行:用户切换方言配置后每块都有原形行可编。
    for (const d of ["uk", "us", "common"] as const) {
      inflections[d] ??= [defaultInflectionRow()];
    }
    return {
      id: p.id,
      pos: p.pos,
      inflections,
      grammar:
        p.grammar_structures.length > 0
          ? p.grammar_structures.map(grammarToRow)
          : [defaultGrammarRow()],
      senses:
        p.senses.length > 0 ? p.senses.map(senseToValue) : [defaultSense()]
    };
  });
  const frequency = frequencyToNumber(word.frequency);
  return {
    frequency,
    dialectMode: word.dialect_mode,
    dialects: word.dialect_mode === "distinguish" ? word.dialects : [],
    senseRanges:
      word.sense_groups.length > 0
        ? word.sense_groups.map((g) => ({ id: g.id, name: g.name }))
        : [{ id: newId(), name: "" }],
    // 空壳(刚创建)预置一个动词 Tab:V3 发布也至少要 1 个词性。
    posList: posList.length > 0 ? posList : [defaultPos("verb", frequency)]
  };
}

// —— toWire:表单值 → 保存请求体 ———————————————————————————————————————————————

const isBlank = (s?: string) => !s || s.trim() === "";

function rowsToForms(rows: InflectionRow[], dialect: Dialect): WordForm[] {
  const forms: WordForm[] = [];
  rows.forEach((row, idx) => {
    // 首行固定原形;「全空行」一律跳过(误点的增行、未填的默认首行都不产生垃圾节点)。
    const category: WordFormType =
      idx === 0 ? "base" : (row.category ?? "base");
    if (isBlank(row.spelling) && isBlank(row.ipa) && isBlank(row.phonetic)) {
      return;
    }
    const prev = forms[forms.length - 1];
    const pron = {
      id: row.pronId,
      dict_phonetic: row.ipa ?? "",
      actual_pron: row.phonetic ?? "",
      style: row.style
    };
    // 相邻行「类别+拼写」相同 → 同一词形的多个读音(强读/弱读),合并进上一 Form。
    if (
      prev &&
      prev.form_type === category &&
      prev.spelling === (row.spelling ?? "")
    ) {
      prev.pronunciations.push(pron);
      return;
    }
    forms.push({
      id: row.formId,
      dialect,
      form_type: category,
      spelling: row.spelling ?? "",
      pronunciations: [pron]
    });
  });
  return forms;
}

function groupsToRelations(sense: SenseValue): WordRelation[] {
  const relations: WordRelation[] = [];
  for (const group of RELATION_GROUPS) {
    for (const row of sense[group.key]) {
      // 未选目标且非服务端孤儿快照的空行跳过。
      if (!row.targetWordId && !row.targetHeadword) continue;
      relations.push({
        id: row.id,
        relation: group.relation,
        target_word_id: row.targetWordId,
        target_sense_id: row.targetSenseId,
        score: Math.round(row.score ?? 0)
      });
    }
  }
  return relations;
}

export function toWire(
  values: EditorFormValues,
  baseUpdatedAt: string
): AdminWordSaveInput {
  const dialectMode = values.dialectMode;
  const enabled: Dialect[] =
    dialectMode === "distinguish" ? values.dialects : ["common"];

  // 语义区间:空名占位行不上送;词义引用了被剔除的区间时一并摘除引用。
  const senseGroups: SenseGroup[] = (values.senseRanges ?? [])
    .filter((g) => !isBlank(g.name))
    .map((g) => ({ id: g.id, name: g.name.trim() }));
  const groupIds = new Set(senseGroups.map((g) => g.id));

  const pos: WordPos[] = (values.posList ?? []).map((tab) => {
    const grammarRows = (tab.grammar ?? []).filter(
      (g) => g && enabled.some((d) => !isBlank(g.texts?.[d]))
    );
    const grammarIds = new Set(grammarRows.map((g) => g.id));
    return {
      id: tab.id,
      pos: tab.pos,
      forms: enabled.flatMap((d) => rowsToForms(tab.inflections?.[d] ?? [], d)),
      grammar_structures: grammarRows.map((g) => ({
        id: g.id,
        variants: enabled
          .filter((d) => !isBlank(g.texts?.[d]))
          .map((d) => ({
            id: g.variantIds?.[d] ?? newId(),
            dialect: d,
            content: toRichText(g.texts![d]!, g.variantRich?.[d])
          }))
      })),
      senses: (tab.senses ?? []).map((s) => ({
        id: s.id,
        sub_pos: s.subPos ?? "",
        level: s.level,
        sense_group_id:
          s.senseGroupId && groupIds.has(s.senseGroupId)
            ? s.senseGroupId
            : undefined,
        frequency: (() => {
          const f = frequencyToWire(s.frequency);
          return f === "" ? undefined : f;
        })(),
        depends_on_context: s.contextDependent ?? false,
        definitions: (s.definitions ?? []).map((d) => ({
          id: d.id,
          level: d.level,
          def_type: d.defType,
          text: toRichText(d.text ?? "", d.rich),
          grammar_structure_id:
            d.grammarId && grammarIds.has(d.grammarId) ? d.grammarId : undefined
        })),
        // 例句:新增的空行不上送;服务端已有的(带 rich 或引用)原样保留。
        sentences: (s.examples ?? [])
          .filter((x) => !isBlank(x.text) || x.sourceExampleId || x.rich)
          .map((x) => ({
            id: x.id,
            source_example_id: x.sourceExampleId,
            text: toRichText(x.text ?? "", x.rich)
          })),
        relations: groupsToRelations(s)
      }))
    };
  });

  return {
    base_updated_at: baseUpdatedAt,
    frequency: frequencyToWire(values.frequency),
    dialect_mode: dialectMode,
    dialects: dialectMode === "distinguish" ? values.dialects : [],
    sense_groups: senseGroups,
    pos
  };
}
