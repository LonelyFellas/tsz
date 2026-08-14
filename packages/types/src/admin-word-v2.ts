import type {
  CefrLevel,
  Dialect,
  AdminWordStatus,
  PronunciationStyle,
  RichText,
  WordFormType,
  WordPosTag,
  WordRelationType,
  WordSubPos
} from "./admin-word";
import type { ProblemMeta } from "./api";

/** 新建单词向导 V2 wire 类型；字段 1:1 镜像 snake_case JSON。 */
export type AdminWordLanguageV2 = "en";
export type WordCreationStep = "basics" | "forms" | "meanings" | "preview";
export type PersistedWordStep = Exclude<WordCreationStep, "preview">;
export type StepSaveIntent = "save" | "complete";
/** 十进制定点百分比字符串：0–100，最多两位小数。 */
export type FixedPercent = string;

export type WordHeadwordsV2 =
  | { mode: "unified"; common: string }
  | {
      mode: "distinguish";
      uk: string;
      us: string;
      source_dialect: "uk" | "us";
    };

export interface TextVariantV2<T> {
  /** 稳定文本节点 ID；内容修改时不得更换。 */
  id: string;
  value: T;
  origin: "dictionary" | "converted" | "manual";
}

export type DialectVariantSlotV2<T> =
  { state: "missing" } | { state: "ready"; variant: TextVariantV2<T> };

export type DialectValueV2<T> =
  | { mode: "unified"; common: TextVariantV2<T> }
  | {
      mode: "distinguish";
      source_dialect: "uk" | "us";
      uk: DialectVariantSlotV2<T>;
      us: DialectVariantSlotV2<T>;
    };

export type EnglishTextV2 = DialectValueV2<RichText>;

export interface WordPronunciationV2 {
  id: string;
  dict_phonetic: string;
  actual_pron: string;
  style: PronunciationStyle;
}

export interface WordFormVariantV2 {
  id: string;
  dialect: Dialect;
  spelling: string;
  origin: "dictionary" | "converted" | "manual";
  pronunciations: WordPronunciationV2[];
}

export interface WordBaseFormSlotV2 {
  id: string;
  form_type: "base";
  variants: WordFormVariantV2[];
}

export interface WordDerivedFormSlotV2 {
  id: string;
  form_type: Exclude<WordFormType, "base">;
  variants: WordFormVariantV2[];
}

export type WordFormSlotV2 = WordBaseFormSlotV2 | WordDerivedFormSlotV2;

export interface WordFormGroupV2 {
  id: string;
  is_regular: boolean;
  slots: WordDerivedFormSlotV2[];
}

export interface WordPosFormsV2 {
  pos_id: string;
  pos: WordPosTag;
  dialect_rules: {
    spelling_mode: "unified" | "distinguish";
    phonetic_mode: "unified" | "distinguish";
  };
  base_form: WordBaseFormSlotV2;
  form_groups: WordFormGroupV2[];
}

export interface DraftFormsStepContent {
  pos: WordPosFormsV2[];
}

export interface GrammarVariantV2 {
  id: string;
  dialect: Dialect;
  content: RichText;
}

export interface GrammarStructureV2 {
  id: string;
  variants: GrammarVariantV2[];
}

export interface WordDefinitionBaseV2 {
  id: string;
  level: CefrLevel;
  grammar_structure_id?: string;
}

export type WordDefinitionV2 = WordDefinitionBaseV2 &
  (
    | {
        definition_mode: "zh_definition" | "zh_sentence";
        /** 中文 content 对应的稳定 text_variant 节点。 */
        content_id: string;
        content: RichText;
      }
    | {
        definition_mode: "en_definition" | "en_sentence";
        content: EnglishTextV2;
      }
  );

export interface WordSentenceLinkV2 {
  word_id: string;
  sense_id: string;
  role: "focus" | "context";
}

export interface WordSentenceV2 {
  id: string;
  level: CefrLevel;
  en_text: EnglishTextV2;
  /** 中文译文对应的稳定 text_variant 节点。 */
  zh_text_id: string;
  zh_text: RichText;
  links: WordSentenceLinkV2[];
}

export interface WordRelationV2 {
  id: string;
  relation: WordRelationType;
  target_word_id: string;
  target_sense_id: string;
  /** 服务端只读快照。 */
  target_headword?: string;
  /** 服务端只读快照。 */
  target_gloss?: string;
  score: FixedPercent;
}

export interface WordSenseV2 {
  id: string;
  sub_pos: WordSubPos;
  level: CefrLevel;
  sense_group_id?: string;
  frequency?: FixedPercent;
  depends_on_context: boolean;
  definitions: WordDefinitionV2[];
  sentences: WordSentenceV2[];
  relations: WordRelationV2[];
}

/** V2 语义区间双语名称；与 legacy `SenseGroup.name` 契约隔离。 */
export interface SenseGroupV2 {
  id: string;
  name_zh: string;
  name_en: string;
}

export interface WordPosMeaningsV2 {
  pos_id: string;
  grammar_structures: GrammarStructureV2[];
  senses: WordSenseV2[];
}

export interface DraftMeaningsStepContent {
  sense_groups: SenseGroupV2[];
  pos: WordPosMeaningsV2[];
}

export interface WordDetectionSnapshotV2 {
  detection_id: string;
  request: {
    language: AdminWordLanguageV2;
    headword: string;
  };
  normalized_headword: string;
  entry_kind: "word" | "phrase";
  matched_dialect: "uk" | "us" | "common";
  builtin_dictionary_status: "matched" | "not_found";
  smart_dictionary_status: "clear";
  headwords: WordHeadwordsV2;
  suggested_pos: WordPosTag[];
  detected_at: string;
}

export interface AdminWordV2 {
  schema_version: 2;
  id: string;
  language: AdminWordLanguageV2;
  kind: "word" | "phrase";
  status: "draft" | "published" | "archived";
  revision: number;
  /** 独立生命周期并发 token；归档/恢复递增，内容保存不变。 */
  lifecycle_revision: number;
  headwords: WordHeadwordsV2;
  frequency?: FixedPercent;
  detection_snapshot: WordDetectionSnapshotV2;
  forms: DraftFormsStepContent;
  meanings: DraftMeaningsStepContent;
  completed_steps: PersistedWordStep[];
  max_reachable_step: WordCreationStep;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  archived_by?: string;
  /** 当前线上 publication 的源 revision；尚未发布时省略。 */
  published_revision?: number;
  /** 当前工作 revision 是否晚于线上 publication。 */
  has_unpublished_changes: boolean;
  published_at?: string;
}

export interface AdminWordV2Envelope {
  word: AdminWordV2;
}

export interface SaveWordStepInput<TContent> {
  base_revision: number;
  intent: StepSaveIntent;
  confirmed_impact_token?: string;
  content: TContent;
}

export type SaveFormsStepInput = SaveWordStepInput<DraftFormsStepContent>;
export type SaveMeaningsStepInput = SaveWordStepInput<DraftMeaningsStepContent>;

export interface DraftValidationIssue {
  step: Exclude<WordCreationStep, "preview">;
  node_id: string;
  field: string;
  code: string;
  message: string;
  reference_location?: DraftReferenceLocation | null;
}

export interface DraftReferenceLocation {
  source_entry_id: string;
  source_publication_id: string;
  source_node_id: string;
  reference_kind: string;
}

export interface DraftValidationResponse {
  validated_revision: number;
  valid: boolean;
  issues: DraftValidationIssue[];
}

export interface DuplicateWordMatchV2 {
  word_id: string;
  headword: string;
  dialect: "uk" | "us" | "common";
  status: AdminWordStatus;
}

export interface BuiltinDictionaryMatchedV2 {
  status: "matched";
  headwords: WordHeadwordsV2;
  suggested_forms: DraftFormsStepContent;
}

export type BuiltinDictionaryUnmatchedV2 =
  | { status: "not_found" }
  | { status: "unavailable"; retry_after_seconds?: number };

export type BuiltinDictionaryResultV2 =
  BuiltinDictionaryMatchedV2 | BuiltinDictionaryUnmatchedV2;

export type SmartDictionaryResultV2 =
  | { status: "clear"; duplicates: [] }
  | { status: "duplicate"; duplicates: DuplicateWordMatchV2[] }
  | { status: "unavailable"; duplicates: [] };

export interface DetectWordResponseBaseV2 {
  detection_id: string;
  expires_at: string;
  request: { language: AdminWordLanguageV2; headword: string };
  normalized_headword: string;
  entry_kind: "word" | "phrase";
  smart_dictionary: SmartDictionaryResultV2;
}

export type DetectWordResponseV2 = DetectWordResponseBaseV2 &
  (
    | {
        matched_dialect: "uk" | "us" | "common";
        builtin_dictionary: BuiltinDictionaryMatchedV2;
      }
    | {
        matched_dialect?: never;
        builtin_dictionary: BuiltinDictionaryUnmatchedV2;
      }
  );

export interface DetectWordInputV2 {
  language: AdminWordLanguageV2;
  headword: string;
}

export interface CreateAdminWordV2Input {
  schema_version: 2;
  detection_id: string;
  headwords: WordHeadwordsV2;
}

export type DialectVariantSuggestionItemV2 =
  | {
      client_id: string;
      field_kind: "form";
      value: string;
    }
  | {
      client_id: string;
      field_kind: "definition" | "example";
      value: RichText;
    };

export interface SuggestDialectVariantsInputV2 {
  source_dialect: "uk" | "us";
  target_dialect: "uk" | "us";
  items: DialectVariantSuggestionItemV2[];
}

export interface SuggestDialectVariantsResponseV2 {
  provider: {
    kind: "dictionary_region_rules" | string;
    version: string;
  };
  suggestions: DialectVariantSuggestionItemV2[];
}

export interface FormsImpactItemV2 {
  node_id: string;
  node_type:
    | "pos"
    | "grammar_structure"
    | "text_variant"
    | "sense"
    | "definition"
    | "sentence"
    | "relation";
  reason: string;
}

export interface PreviewFormsImpactInputV2 {
  base_revision: number;
  content: DraftFormsStepContent;
}

export interface FormsImpactResponseV2 {
  base_revision: number;
  requires_confirmation: boolean;
  affected: FormsImpactItemV2[];
  confirmation_token?: string;
}

/** Endpoint-oriented alias; wire shape is FormsImpactResponseV2. */
export type PreviewFormsImpactResponseV2 = FormsImpactResponseV2;

export interface ValidateAdminWordV2Input {
  base_revision: number;
}

export interface PublishAdminWordV2Input {
  base_revision: number;
}

export interface DeleteDraftInput {
  base_revision: number;
  base_lifecycle_revision: number;
}

export interface EntryLifecycleInput {
  base_revision: number;
  base_lifecycle_revision: number;
}

export interface EntryLifecycleTarget extends EntryLifecycleInput {
  id: string;
}

export interface EntryLifecycleBatchInput {
  entries: EntryLifecycleTarget[];
}

export interface EntryLifecycleBatchResponse {
  words: AdminWordV2[];
  affected: number;
}

/** @deprecated 新代码统一使用通用 ProblemMeta。 */
export type AdminWordApiErrorMeta = ProblemMeta;

export interface AdminWordApiError {
  error: string;
  code: string;
  details?: string[];
  field_issues?: DraftValidationIssue[];
  meta?: AdminWordApiErrorMeta;
}
