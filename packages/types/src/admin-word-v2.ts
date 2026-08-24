import type {
  CefrLevel,
  Dialect,
  AdminWordStatus,
  PronunciationStyle,
  WordFormType,
  WordPosTag,
  WordRelationType,
  WordSubPos
} from "./admin-word";
import type { RichText } from "./rich-text";
import type { ProblemMeta } from "./api";
import type {
  SurfaceMatchCategoryV2,
  MatchedEntryContextV2,
  SurfaceMatchPageV2,
  SurfacePolicyNameV2
} from "./surface-match";

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
  /**
   * 已绑定形态：与 target_sense_id 成对指向真实义项。
   *
   * 待物化形态下后端 `skip_serializing_if` 让这两个键**整个缺席**（不是 null），
   * 所以必须可选——按必填读会在 `.trim()` 处炸 TypeError。
   */
  target_word_id?: string;
  target_sense_id?: string;
  /**
   * 待物化形态：目标词还没建条，只承载管理员录入的词面，发布时后端建条并回填
   * target_*。与 target_* 严格互斥，由库层 lexicon_relations_target_shape_check 保证。
   */
  pending_target_headword?: string;
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

export type ContentCompletionScope =
  "grammar_structures" | "meanings" | "examples";
export type ContentCompletionFillPolicy = "missing_only";
export type ContentCompletionJobStatus =
  "pending" | "running" | "completed" | "partial" | "failed";
export type ContentCompletionPartitionStatus =
  "pending" | "running" | "completed" | "missing" | "failed";

export interface CreateContentCompletionJobInput {
  base_revision: number;
  scope: ContentCompletionScope[];
  fill_policy: ContentCompletionFillPolicy;
}

export interface RetryContentCompletionJobInput {
  pos_ids: string[];
}

export type ContentCompletionEvidenceKind =
  "dictionary_grounded_translation" | "model_inferred" | "model_generated";

export interface ContentCompletionProvenance {
  dictionary: {
    provider: string;
    dataset_version: string;
    source_record_keys: string[];
  };
  generation: {
    provider: string;
    model: string;
    prompt_version: string;
  };
  field_origins: {
    grammar_structures: ContentCompletionEvidenceKind;
    meanings: ContentCompletionEvidenceKind;
    examples: ContentCompletionEvidenceKind;
    cefr: ContentCompletionEvidenceKind;
  };
  generated_at: string;
}

export interface ContentCompletionPartition {
  pos_id: string;
  pos: string;
  status: ContentCompletionPartitionStatus;
  attempt: number;
  error_code?: string;
  error_detail?: string;
  provenance?: ContentCompletionProvenance;
}

export interface ContentCompletionJob {
  id: string;
  entry_id: string;
  base_revision: number;
  status: ContentCompletionJobStatus;
  requested_scope: ContentCompletionScope[];
  fill_policy: ContentCompletionFillPolicy;
  partitions: ContentCompletionPartition[];
  result?: DraftMeaningsStepContent;
  created_at: string;
  updated_at: string;
}

export interface ContentCompletionJobEnvelope {
  job: ContentCompletionJob;
}

export interface DictionaryProviderV2 {
  name: string;
  version: string;
}

export type DictionaryCoverageStateV2 = "complete" | "partial" | "missing";

export interface DictionaryCoverageV2 {
  forms: DictionaryCoverageStateV2;
  pronunciations: DictionaryCoverageStateV2;
  meanings: DictionaryCoverageStateV2;
  examples: DictionaryCoverageStateV2;
  frequency: DictionaryCoverageStateV2;
}

export interface DictionaryProvenanceV2 {
  forms: DictionaryProviderV2 | null;
  pronunciations: DictionaryProviderV2 | null;
  meanings: DictionaryProviderV2 | null;
  examples: DictionaryProviderV2 | null;
  frequency: DictionaryProviderV2 | null;
}

export interface DetectionSurfaceMatchPreviewV2 {
  match_id: string;
  match_category: SurfaceMatchCategoryV2;
  existing_word_id: string;
  existing_headword: string;
  existing_kind: "word" | "phrase";
  existing_status: "draft" | "published" | "archived";
  existing_dialect: "uk" | "us" | "common";
  pos_labels: string[];
  gloss_previews: string[];
}

export interface DetectionSurfaceWarningAuditV2 {
  total: number;
  match_digest: string;
  acknowledged: true;
  acknowledged_at: string;
  acknowledged_by: string;
  policy_name: SurfacePolicyNameV2;
  policy_epoch: number;
  preview: DetectionSurfaceMatchPreviewV2[];
  truncated: boolean;
}

export interface WordDetectionSnapshotBaseV2 {
  detection_id: string;
  request: {
    language: AdminWordLanguageV2;
    headword: string;
  };
  normalized_headword: string;
  entry_kind: "word" | "phrase";
  matched_dialect: "uk" | "us" | "common";
  builtin_dictionary_status: "matched" | "not_found";
  dictionary_provider?: DictionaryProviderV2 | null;
  dictionary_coverage?: DictionaryCoverageV2 | null;
  dictionary_provenance?: DictionaryProvenanceV2 | null;
  headwords: WordHeadwordsV2;
  suggested_pos: WordPosTag[];
  detected_at: string;
}

export type WordDetectionSnapshotV2 = WordDetectionSnapshotBaseV2 &
  (
    | {
        smart_dictionary_status: "clear";
        surface_warning?: null;
      }
    | {
        smart_dictionary_status: "warning";
        surface_warning: DetectionSurfaceWarningAuditV2;
      }
  );

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

/**
 * 一个已退役但仍被永久占用的稳定槽位身份。
 *
 * 稳定槽位的键是 `(entry_id, parent_node_id, node_role)`，方言编在 `node_role`
 * 里（`forms.form_variant:common`）。这个键一旦保存过就永久绑定同一个节点 ID：
 * 节点从草稿里消失只是被标记退役，重新出现时必须沿用原 ID，否则报
 * `stable_node_id_changed`。
 */
export interface RetiredStableSlotV2 {
  id: string;
  parent_node_id: string;
  node_role: string;
}

/**
 * `GET /entries/{id}` 的响应：草稿本体 + 重建编辑态所需的节点身份信息。
 *
 * 命令类接口仍返回 {@link AdminWordV2Envelope}；退役身份是编辑器恢复用的元数据，
 * 不属于词条内容，也不会进入不可变的 publication 快照。
 */
export interface AdminWordDraftV2Envelope extends AdminWordV2Envelope {
  retired_stable_slots: RetiredStableSlotV2[];
}

export interface SaveWordStepInput<TContent> {
  base_revision: number;
  intent: StepSaveIntent;
  content: TContent;
}

export interface SaveFormsStepInput extends SaveWordStepInput<DraftFormsStepContent> {
  confirmed_impact_token?: string;
  confirmed_surface_match_token?: string;
}
export type SaveMeaningsStepInput = SaveWordStepInput<DraftMeaningsStepContent>;

export interface DraftValidationIssue {
  step: Exclude<WordCreationStep, "preview">;
  node_id: string;
  field: string;
  code: string;
  message: string;
  reference_location?: DraftReferenceLocation | null;
  /**
   * 仅节点身份类问题（`stable_node_id_changed` / `node_binding_changed` /
   * `node_binding_unknown`）带这个子对象，其余 issue 整体省略。
   */
  node_location?: DraftNodeLocation | null;
}

/**
 * 把节点身份类问题还原到界面位置用的定位信息。
 *
 * 所有字段都取自**本次提交的内容**，不含任何服务端存量节点 ID——旧 ID / 新 ID
 * 的对照只写服务端日志。`message` 面向实现，展示文案由前端按这里的字段自行拼装。
 */
export interface DraftNodeLocation {
  /** 出问题节点的角色，方言编在冒号之后，例如 `forms.form_variant:common`。 */
  node_role: string;
  /** 从词条根到直接父节点的祖先链，全部是本次提交里的节点 ID。 */
  ancestor_node_ids: string[];
  /** 所属基本词性编码（`verb` / `noun` …）；不挂在基本词性下的节点省略。 */
  pos?: WordPosTag;
  /** 所属基本词性的节点 ID。 */
  pos_id?: string;
  /** 所在词形组在 `pos.form_groups` 中的序号（从 0 开始）；共享原形不属于任何组，省略。 */
  form_group_index?: number;
  /** 所在词形槽位的类型；`base` 表示共享原形。词形之外的节点省略。 */
  form_type?: WordFormType;
  /** 方言侧；节点角色不带方言时省略。 */
  dialect?: Dialect;
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
  coverage: DictionaryCoverageV2;
}

export type BuiltinDictionaryUnmatchedV2 =
  | { status: "not_found" }
  | { status: "unavailable"; retry_after_seconds?: number };

export type BuiltinDictionaryResultV2 =
  BuiltinDictionaryMatchedV2 | BuiltinDictionaryUnmatchedV2;

export type SmartDictionaryResultV2 =
  | { status: "clear"; duplicates: [] }
  | { status: "duplicate"; duplicates: DuplicateWordMatchV2[] }
  | {
      status: "warning";
      duplicates: [];
      surface_match_page: SurfaceMatchPageV2;
      matched_entry_contexts: MatchedEntryContextV2[];
    }
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
  confirmed_surface_match_token?: string;
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
  surface_match_page?: SurfaceMatchPageV2;
}

/** Endpoint-oriented alias; wire shape is FormsImpactResponseV2. */
export type PreviewFormsImpactResponseV2 = FormsImpactResponseV2;

export interface ValidateAdminWordV2Input {
  base_revision: number;
}

export interface PublishAdminWordV2Input {
  base_revision: number;
  confirmed_surface_match_token?: string;
}

export interface ActivatePublicationInput {
  base_revision: number;
  base_lifecycle_revision: number;
  confirmed_surface_match_token?: string;
}

export interface DeleteDraftInput {
  base_revision: number;
  base_lifecycle_revision: number;
}

export interface EntryLifecycleInput {
  base_revision: number;
  base_lifecycle_revision: number;
  confirmed_surface_match_token?: string;
}

export interface EntryLifecycleTarget {
  id: string;
  base_revision: number;
  base_lifecycle_revision: number;
}

export interface EntryLifecycleBatchInput {
  entries: EntryLifecycleTarget[];
  confirmed_surface_match_token?: string;
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
