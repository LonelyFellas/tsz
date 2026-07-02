// 智能词库(管理后台词条创编)wire 类型 —— 1:1 镜像后端 Go JSON(snake_case)。
// 权威来源:tsz-go/docs/openapi.yaml tag `Admin (words)`;叙述性说明见
// docs/admin-wordlist-frontend-integration.md。与 web 词表的旧 Word(./word.ts)无关。
//
// 关键约定(详见对接文档 §3.3):
// - 树内所有子节点 id 由前端生成(UUID v4)且跨保存稳定,后端按 id diff-upsert;
// - word.updated_at 兼作乐观锁 token(保存时回传 base_updated_at);
// - 数组顺序即排序,读回保持原序;
// - audio_url / audio_source 与关联词快照(target_headword/target_gloss)为服务端
//   自有字段,请求里发了也会被忽略。

export type Dialect = "uk" | "us" | "common";
export type DialectMode = "unified" | "distinguish";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type AdminWordKind = "word" | "phrase";
export type AdminWordStatus = "draft" | "published";

/** 基本词性(词条内不重复)。 */
export type WordPosTag =
  | "noun"
  | "pronoun"
  | "verb"
  | "adjective"
  | "adverb"
  | "preposition"
  | "article"
  | "determiner"
  | "conjunction"
  | "numeral"
  | "interjection";

/** 词形类别:base 每 pos+方言唯一且必有,其余类型可重复。 */
export type WordFormType =
  | "base"
  | "present_participle"
  | "past_tense"
  | "past_participle"
  | "third_person_singular"
  | "plural"
  | "comparative"
  | "superlative";

/** 细分词性(提交英文码,UI 显示中文)。草稿允许空串,发布必填。 */
export type WordSubPos =
  | ""
  | "V-T"
  | "V-I"
  | "V-LINK"
  | "AUX"
  | "MODAL"
  | "ADJ"
  | "ADV"
  | "N-COUNT"
  | "N-UNCOUNT"
  | "N-PROPER"
  | "N-PLURAL"
  | "N-SING"
  | "PRON"
  | "PREP"
  | "CONJ"
  | "DET"
  | "ART"
  | "NUM"
  | "INT";

export type WordRelationType = "synonym" | "antonym" | "derivative";
export type PronunciationStyle = "normal" | "strong" | "weak";

/** 富文本(D7):纯文本 + 位置标记,偏移量按 Unicode 码点计(非 UTF-16 下标)。 */
export interface RichText {
  version: 1;
  /** ≤ 5000 码点 */
  text: string;
  /** ≤ 500;加粗/蓝色区间 [start, end) */
  spans: RichTextSpan[];
  /** ≤ 500;连读点:i 表示码点 i 与 i+1 之间 */
  liaisons: number[];
}

export interface RichTextSpan {
  start: number;
  end: number;
  type: "bold" | "blue";
}

/** 语义区间(可选的命名分组,词义可指向它)。 */
export interface SenseGroup {
  id: string;
  name: string;
}

/** 读音。audio_* 只读(归 TTS/上传接口管)。 */
export interface WordPronunciation {
  id: string;
  /** 词典音标(发布必填) */
  dict_phonetic: string;
  /** 实际发音(发布必填) */
  actual_pron: string;
  style: PronunciationStyle;
  audio_url?: string;
  audio_source?: string;
}

/** 词形变化:某方言下的一种拼写。 */
export interface WordForm {
  id: string;
  dialect: Dialect;
  form_type: WordFormType;
  /** 发布必填 */
  spelling: string;
  /** 发布时至少 1 条 */
  pronunciations: WordPronunciation[];
}

/** 语法结构下各方言的措辞(同一结构内方言不重复)。 */
export interface GrammarVariant {
  id: string;
  dialect: Dialect;
  content: RichText;
  audio_url?: string;
  audio_source?: string;
}

/** 语法结构:编号分组,与方言无关的引用单元(D4)。 */
export interface GrammarStructure {
  id: string;
  /** 发布时每个启用方言 1 条非空措辞 */
  variants: GrammarVariant[];
}

/** 多维释义。 */
export interface WordDefinition {
  id: string;
  level: CefrLevel;
  def_type: "zh" | "en";
  /** 发布时非空 */
  text: RichText;
  /** 指向同一 pos 下的语法结构 id */
  grammar_structure_id?: string;
  audio_url?: string;
  audio_source?: string;
}

/** 多维例句:弱引用未来例句模块 + 文本快照(D5),可并存或单独存在。 */
export interface WordSentence {
  id: string;
  source_example_id?: string;
  text?: RichText;
  audio_url?: string;
  audio_source?: string;
}

/** 关联词:指向其他词条的某个词义;快照字段服务端写(D6)。 */
export interface WordRelation {
  id: string;
  relation: WordRelationType;
  /** 与 target_sense_id 双 null = 目标已删除的孤儿(只剩快照,原样带回) */
  target_word_id?: string;
  /** 发布必填(V10) */
  target_sense_id?: string;
  /** 只读快照 */
  target_headword?: string;
  /** 只读快照 */
  target_gloss?: string;
  /** 0–100 整数 */
  score: number;
}

/** 词义。⚠️ id 被其他词条的关联词引用,跨保存绝不可换。 */
export interface WordSense {
  id: string;
  /** 细分词性;草稿可为 "",发布必填 */
  sub_pos: WordSubPos;
  /** 草稿也必须是合法 CEFR 值 */
  level: CefrLevel;
  /** 指向本词条 sense_groups 里的 id */
  sense_group_id?: string;
  /** 词义词频(发布必填);交互约定:新建词义默认带出词条词频 */
  frequency?: string;
  /** 是否依赖语境(影响学习端可出的题型) */
  depends_on_context: boolean;
  /** 发布时至少 1 条 */
  definitions: WordDefinition[];
  sentences: WordSentence[];
  relations: WordRelation[];
}

/** 基本词性 Tab。 */
export interface WordPos {
  id: string;
  pos: WordPosTag;
  /** 发布时每个启用方言恰好 1 个 base 词形 */
  forms: WordForm[];
  /** 发布时至少 1 个 */
  grammar_structures: GrammarStructure[];
  /** 发布时至少 1 个 */
  senses: WordSense[];
}

/** 词条整棵树(GET/保存/发布响应里的 word)。 */
export interface AdminWord {
  id: string;
  kind: AdminWordKind;
  headword: string;
  /** 词频:百分数字符串 0–100,服务端归一化为 6 位小数回显;未填时字段缺省 */
  frequency?: string;
  dialect_mode: DialectMode;
  /** unified 时为 [];distinguish 时为 uk/us 子集 */
  dialects: Dialect[];
  status: AdminWordStatus;
  created_by: string;
  created_at: string;
  /** ← 乐观锁 token,保存/提交以此为基准 */
  updated_at: string;
  sense_groups: SenseGroup[];
  pos: WordPos[];
}

/** PUT /admin/words/{id}/content 请求体:完整可编辑树(非增量 patch)。 */
export interface AdminWordSaveInput {
  /** 必填:客户端最后一次读到的 word.updated_at,不符 → 409 */
  base_updated_at: string;
  /** "" 表示未填(仅草稿允许) */
  frequency: string;
  dialect_mode: DialectMode;
  dialects: Dialect[];
  sense_groups: SenseGroup[];
  pos: WordPos[];
}

/** POST /admin/words 请求体。 */
export interface AdminWordCreateInput {
  headword: string;
  /** 缺省 word */
  kind?: AdminWordKind;
}

/** 创建 / 加载 / 保存 / 发布共用的响应外壳。 */
export interface AdminWordEnvelope {
  word: AdminWord;
}

/** GET /admin/words 查询参数(全部可选,对应列表页搜索行)。 */
export interface AdminWordListQuery {
  page?: number;
  /** 上限 100,缺省 20 */
  page_size?: number;
  /** 词汇或创建人姓名,子串匹配 */
  q?: string;
  /** 释义文本,子串匹配 */
  gloss?: string;
  kind?: AdminWordKind;
  pos?: WordPosTag;
  /** 命中任意一个词义等级即算 */
  level?: CefrLevel;
  status?: AdminWordStatus;
  /** RFC3339,半开区间 [from, to) */
  created_from?: string;
  created_to?: string;
}

/** 列表行(读取时派生:gloss 取第一个词性第一个词义的第一条释义)。 */
export interface AdminWordListItem {
  id: string;
  headword: string;
  kind: AdminWordKind;
  gloss: string;
  pos_list: WordPosTag[];
  /** 聚合所有词义等级,升序 */
  levels: CefrLevel[];
  status: AdminWordStatus;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface AdminWordListPage {
  page: number;
  page_size: number;
  total: number;
}

export interface AdminWordListResponse {
  words: AdminWordListItem[];
  page: AdminWordListPage;
}

/** GET /admin/words/stats(注意:不包 word/words 外壳)。今日/本月按 Asia/Shanghai。 */
export interface AdminWordStats {
  total: number;
  today: number;
  month: number;
}

/** POST /admin/words/batch-delete 响应:实际存在并删掉的条数(不存在的 id 跳过)。 */
export interface AdminWordBatchDeleteResponse {
  deleted: number;
}

/** GET /admin/words/related-search 结果项。 */
export interface RelatedWordResult {
  word_id: string;
  headword: string;
  kind: AdminWordKind;
  senses: RelatedWordSense[];
}

export interface RelatedWordSense {
  sense_id: string;
  /** 优先取该词义第一条中文释义(与快照规则一致,D6) */
  gloss: string;
}

export interface RelatedSearchResponse {
  results: RelatedWordResult[];
}

/** 422 word is incomplete 的响应体:details 逐条列出发布检查违规(V1–V10)。 */
export interface AdminWordIncompleteError {
  error: string;
  details: string[];
}
