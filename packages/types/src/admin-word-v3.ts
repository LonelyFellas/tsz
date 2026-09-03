import type {
  AdminWordListPage,
  AdminWordStatus,
  AdminWordV2ListItem,
  Dialect,
  PronunciationStyle,
  RelatedWordResult,
  SourceDialect
} from "./admin-word";
import type {
  ActivatePublicationInput,
  AdminWordDraftV2Envelope,
  AdminWordV2,
  CreateAdminWordV2Input,
  DetectWordInputV2,
  DetectWordResponseV2,
  DraftValidationIssueV2,
  DraftValidationResponse,
  FormsImpactResponseV2,
  PersistedWordStep,
  PreviewFormsImpactInputV2,
  PublishAdminWordV2Input,
  SaveFormsStepInput,
  SaveMeaningsStepInput,
  StepSaveIntent,
  ValidateAdminWordV2Input,
  WordCreationStep,
  WordHeadwordsV2,
  EntryReferenceSummary
} from "./admin-word-v2";
import type { SurfaceMatchItemV3, SurfaceMatchPageV3 } from "./surface-match";

/** Smart Lexicon V3 wire types; all fields mirror the generated OpenAPI snake_case JSON. */
export type EnglishLanguageV3 = "en";
export type WordEntryKindV3 = "word" | "phrase";
export type TextOriginV3 = "dictionary" | "converted" | "manual";
export type PronunciationNormalizationVersionV3 = "nfkc_trim_lower_v1";
export type CommonDialectV3 = "common";
export type UkDialectV3 = "uk";
export type UsDialectV3 = "us";
export type DialectModeV3 = "unified" | "distinguish";

export interface DialectRulesV3 {
  spelling_mode: DialectModeV3;
  phonetic_mode: DialectModeV3;
}

/** `base` is a peer form type. It is neither unique nor a parent of other forms. */
export type WordFormTypeV3 =
  | "base"
  | "third_person_singular"
  | "present_participle"
  | "past_tense"
  | "past_participle"
  | "plural"
  | "comparative"
  | "superlative";

export interface WordPronunciationV3 {
  id: string;
  dict_phonetic: string;
  actual_pron: string;
  /** Draft may omit this; complete/publish requires it. */
  style?: PronunciationStyle;
}

export type PhraseComponentUsageV3 =
  | {
      state: "unresolved";
      id: string;
      literal: string;
    }
  | {
      state: "resolved";
      id: string;
      literal: string;
      target_word_id: string;
      target_publication_id: string;
      target_pos_id: string;
      target_base_form_id: string;
      target_sense_id: string;
      target_form_id: string;
      target_variant_id: string;
      target_dialect: Dialect;
      target_form_type: WordFormTypeV3;
      target_headword: string;
      target_gloss: string;
    };

interface WordFormVariantBaseV3<TDialect extends Dialect> {
  id: string;
  dialect: TDialect;
  spelling: string;
  origin: TextOriginV3;
  pronunciations: WordPronunciationV3[];
  component_usages?: PhraseComponentUsageV3[];
}

export type WordCommonFormVariantV3 = WordFormVariantBaseV3<CommonDialectV3>;
export type WordUkFormVariantV3 = WordFormVariantBaseV3<UkDialectV3>;
export type WordUsFormVariantV3 = WordFormVariantBaseV3<UsDialectV3>;

/** A concrete form owns either one common variant or the complete UK/US pair. */
export type WordRegionalVariantsV3 =
  | { mode: "common"; common: WordCommonFormVariantV3 }
  | { mode: "uk_us"; uk: WordUkFormVariantV3; us: WordUsFormVariantV3 };

export interface WordConcreteFormV3 {
  id: string;
  form_type: WordFormTypeV3;
  regional_variants: WordRegionalVariantsV3;
}

export interface WordFormGroupMemberV3 {
  id: string;
  form_id: string;
}

export interface WordFormGroupV3 {
  id: string;
  /** Migration metadata only; it does not imply a base/derived hierarchy. */
  is_regular: boolean;
  members: WordFormGroupMemberV3[];
}

export interface WordPosFormsV3 {
  pos_id: string;
  pos: string;
  dialect_rules: DialectRulesV3;
  forms: WordConcreteFormV3[];
  form_groups: WordFormGroupV3[];
}

export interface DraftFormsStepContentV3 {
  pos: WordPosFormsV3[];
}

export interface RichTextSpanV3 {
  start: number;
  end: number;
  type: "bold" | "blue";
}

export type RichTextAnnotationV3 =
  | {
      type: "emphasis";
      start: number;
      end: number;
      level: "strong";
    }
  | {
      type: "phoneme";
      start: number;
      end: number;
      alphabet: "ipa";
      phoneme: string;
    }
  | {
      type: "liaison";
      start: number;
      end: number;
    }
  | {
      type: "highlight";
      start: number;
      end: number;
      color: "yellow" | "green" | "pink" | "blue" | "orange";
    }
  | {
      type: "pause";
      at: number;
      duration_ms: number;
    };

export interface RichTextV1V3 {
  version: 1;
  text: string;
  spans: RichTextSpanV3[];
  liaisons: number[];
}

export interface RichTextV2V3 {
  version: 2;
  text: string;
  annotations: RichTextAnnotationV3[];
}

export type RichTextV3 = RichTextV1V3 | RichTextV2V3;

export interface RichTextVariantV3 {
  id: string;
  value: RichTextV3;
  origin: TextOriginV3;
}

export type DialectVariantRichTextSlotV3 =
  { state: "missing" } | { state: "ready"; variant: RichTextVariantV3 };

export type EnglishTextV3 =
  | { mode: "unified"; common: RichTextVariantV3 }
  | {
      mode: "distinguish";
      source_dialect: SourceDialect;
      uk: DialectVariantRichTextSlotV3;
      us: DialectVariantRichTextSlotV3;
    };

export interface SenseGroupV3 {
  id: string;
  name_zh: string;
  name_en: string;
}

export interface GrammarVariantV3 {
  id: string;
  dialect: Dialect;
  content: RichTextV3;
}

export interface GrammarStructureV3 {
  id: string;
  variants: GrammarVariantV3[];
}

interface WordDefinitionBaseV3 {
  id: string;
  level: string;
  grammar_structure_id?: string;
}

export type WordDefinitionV3 = WordDefinitionBaseV3 &
  (
    | {
        definition_mode: "zh_definition" | "zh_sentence";
        content_id: string;
        content: RichTextV3;
      }
    | {
        definition_mode: "en_definition" | "en_sentence";
        content: EnglishTextV3;
      }
  );

export interface SentenceSourceRangeV3 {
  start: number;
  end: number;
  surface: string;
}

export type SentenceTranslationBandV3 = "a1_a2" | "b1_b2" | "c1_c2";

export interface WordSentenceTranslationV3 {
  id: string;
  band: SentenceTranslationBandV3;
  content: RichTextV3;
}

interface WordSentenceAssociationBaseV3 {
  id: string;
  association_schema_version: 3;
  source_dialect: Dialect;
  source_segments: SentenceSourceRangeV3[];
  origin: "auto" | "manual";
}

export type WordSentenceAssociationV3 = WordSentenceAssociationBaseV3 &
  (
    | {
        state: "linked";
        target_word_id: string;
        target_sense_id: string;
        target_form_slot_id?: string;
        target_publication_id?: string;
        target_form_variant_id?: string;
        target_component_usages: PhraseComponentUsageV3[];
        target_headword: string;
        target_gloss: string;
        resolved_pos: string;
        resolved_form_type?: string;
      }
    | {
        state: "pending";
        pending_target_kind: WordEntryKindV3;
        pending_target_headword: string;
        normalized_pending_target_headword?: string;
        pending_target_gloss?: string;
      }
  );

interface SentenceAssociationInputBaseV3 {
  id: string;
  source_dialect: Dialect;
  source_segments: SentenceSourceRangeV3[];
}

export type SentenceAssociationInputV3 = SentenceAssociationInputBaseV3 &
  (
    | {
        target_word_id: string;
        target_sense_id: string;
        /** 旧兼容 linked 可能缺失；新发现/认领必须提交 exact identity。 */
        target_publication_id?: string;
        /** 旧兼容 linked 可能缺失；新发现/认领必须提交 exact identity。 */
        target_form_variant_id?: string;
        pending_target_kind?: never;
        pending_target_headword?: never;
        pending_target_gloss?: never;
      }
    | {
        target_word_id?: never;
        target_sense_id?: never;
        pending_target_kind: WordEntryKindV3;
        pending_target_headword: string;
        pending_target_gloss?: string;
      }
  );

export interface ReplaceSentenceAssociationsInputV3 {
  association_schema_version: 3;
  base_revision: number;
  base_lifecycle_revision: number;
  associations: SentenceAssociationInputV3[];
}

export interface PendingSentenceAssociationItemV3 {
  association_id: string;
  owner_entry_id: string;
  owner_entry_revision: number;
  owner_lifecycle_revision: number;
  sentence_id: string;
  source_dialect: Dialect;
  source_segments: SentenceSourceRangeV3[];
  sentence_text: string;
  pending_target_kind: WordEntryKindV3;
  pending_target_headword: string;
  pending_target_gloss?: string;
}

export interface PendingSentenceAssociationListResponseV3 {
  results: PendingSentenceAssociationItemV3[];
  total: number;
  next_cursor: string | null;
}

export interface PendingSentenceAssociationListQueryV3 {
  cursor?: string;
  page_size?: number;
}

export interface ClaimPendingSentenceAssociationInputV3 {
  target_word_id: string;
  target_sense_id: string;
  target_publication_id?: string;
  target_form_variant_id?: string;
  base_owner_entry_revision: number;
  base_owner_lifecycle_revision: number;
}

export type ResolveSentenceTargetsV3Input =
  | {
      schema_version: 3;
      sentence_text: string;
      source_dialect: Dialect;
      mode: "all_published_targets";
      page_size_per_range?: number;
    }
  | {
      schema_version: 3;
      sentence_text: string;
      source_dialect: Dialect;
      mode: "selected_segments";
      selected_segments: SentenceSourceRangeV3[];
      include_drafts: boolean;
      page_size_per_range?: number;
      cursor?: string;
    };

export type SentenceTargetMatchKindV3 =
  "word" | "contiguous_phrase" | "separable_phrase";

export interface SentenceTargetMatchEvidenceV3 {
  surface: string;
  normalized_surface: string;
  match_kind: SentenceTargetMatchKindV3;
}

export interface SentenceTargetSenseV3 {
  sense_id: string;
  publication_id: string;
  pos_id: string;
  base_form_id: string;
  level: string;
  gloss: string;
}

export interface SentenceTargetCandidateFormV3 {
  form_id: string;
  variant_id: string;
  form_type: WordFormTypeV3;
  spelling: string;
  dialect: Dialect;
  /** 该词形可搭配的原形 id（同组或自身即原形）；为空表示不可作成分目标。 */
  base_form_ids: string[];
}

export interface PublishedSentenceTargetCandidateV3 {
  entry_id: string;
  publication_id: string;
  pos_id: string;
  base_form_id: string;
  headword: string;
  kind: WordEntryKindV3;
  pos: string;
  matched_form_id: string;
  matched_variant_id: string;
  matched_dialect: Dialect;
  matched_form_type: WordFormTypeV3;
  component_usages: PhraseComponentUsageV3[];
  forms: SentenceTargetCandidateFormV3[];
  matches: SentenceTargetMatchEvidenceV3[];
  senses: SentenceTargetSenseV3[];
}

export interface DraftSentenceTargetCandidateV3 {
  entry_id: string;
  entry_revision: number;
  headword: string;
  target_state: "draft";
  linkability: "pending_only";
}

export interface SentenceTargetRangeResultV3 {
  source_segments: SentenceSourceRangeV3[];
  segments_fingerprint: string;
  normalized_surface: string;
  published_total: number;
  published_matches: PublishedSentenceTargetCandidateV3[];
  next_cursor?: string;
  draft_matches: DraftSentenceTargetCandidateV3[];
}

/** 按关键字检索短语成分目标：对已发布词面做包含匹配，与 resolve 的候选同构。 */
export interface SearchComponentTargetsV3Input {
  schema_version: 3;
  /** 关键字，1..=100 码点且两端不留空白；带空白后端直接 422。 */
  q: string;
  /** 只要单词或只要短语；不传则两者都返回。 */
  kind?: WordEntryKindV3;
  page_size?: number;
  /** 上一页返回的 `next_cursor`；换了关键字/kind 或词面数据变动后即失效（400 invalid_query）。 */
  cursor?: string;
}

export interface SearchComponentTargetsV3Response {
  schema_version: 3;
  /**
   * 与 resolve 的 `published_matches` 同构。关键字检索没有句子区间，
   * 每条候选的 `matches` 恒为空数组，前端据此不渲染「命中」标识。
   */
  matches: PublishedSentenceTargetCandidateV3[];
  /** 扫描窗口内命中的候选总数；`truncated` 为 true 时是下界，不是全库命中数。 */
  total: number;
  /** 还有未返回的候选：有下一页（同时给出 `next_cursor`），或触到后端扫描上限（此时无 `next_cursor`）。 */
  truncated: boolean;
  /** 还有下一页时返回；下一页用相同的 `q` / `kind` / `page_size` 携带此值。 */
  next_cursor?: string;
}

export interface ResolveSentenceTargetsV3Response {
  schema_version: 3;
  sentence_hash: string;
  discovery_generation: number;
  completeness: "complete" | "overloaded";
  range_results: SentenceTargetRangeResultV3[];
}

export interface WordSentenceLinkV3 {
  word_id: string;
  sense_id: string;
  role: string;
}

export interface WordSentenceV3 {
  id: string;
  level: string;
  en_text: EnglishTextV3;
  zh_text_id: string;
  zh_text: RichTextV3;
  zh_translations?: WordSentenceTranslationV3[];
  links: WordSentenceLinkV3[];
  associations: WordSentenceAssociationV3[];
  associations_state: "unresolved" | "resolved";
}

export interface WordRelationV3 {
  id: string;
  relation: string;
  target_word_id?: string;
  target_sense_id?: string;
  prebound_target_word_id?: string;
  pending_target_headword?: string;
  pending_target_gloss?: string;
  target_headword?: string;
  target_gloss?: string;
  prebinding_state?: "waiting_first_sense" | "target_sense_deleted";
  target_status?: "draft" | "published" | "archived";
  score: string;
}

export interface WordSenseV3 {
  id: string;
  sub_pos: string;
  level: string;
  sense_group_id?: string;
  frequency?: string;
  depends_on_context: boolean;
  definitions: WordDefinitionV3[];
  sentences: WordSentenceV3[];
  relations: WordRelationV3[];
}

export interface WordPosMeaningsV3 {
  pos_id: string;
  grammar_structures: GrammarStructureV3[];
  senses: WordSenseV3[];
}

export interface DraftMeaningsStepContentV3 {
  sense_groups: SenseGroupV3[];
  pos: WordPosMeaningsV3[];
}

/** V3 meanings 写入 DTO 不包含服务端生成的关联解析投影。 */
export interface WordSentenceWritableV3 {
  id: string;
  level: string;
  en_text: EnglishTextV3;
  zh_text_id: string;
  zh_text: RichTextV3;
  zh_translations: WordSentenceTranslationV3[];
  links: WordSentenceLinkV3[];
}

/** V3 meanings 写入 DTO 不接受只读的目标展示快照。 */
export interface WordRelationWritableV3 {
  id: string;
  relation: string;
  target_word_id?: string;
  target_sense_id?: string;
  prebound_target_word_id?: string;
  /** 纯待建关联词的词面；预绑定（prebound_target_word_id 非空）不得携带，词面回显走只读 target_headword。 */
  pending_target_headword?: string;
  /** 预定义词义：跟随待建词面或预绑定草稿。 */
  pending_target_gloss?: string;
  score: string;
}

export interface WordSenseWritableV3 {
  id: string;
  sub_pos: string;
  level: string;
  sense_group_id?: string;
  frequency?: string;
  depends_on_context: boolean;
  definitions: WordDefinitionV3[];
  sentences: WordSentenceWritableV3[];
  relations: WordRelationWritableV3[];
}

export interface WordPosMeaningsWritableV3 {
  pos_id: string;
  grammar_structures: GrammarStructureV3[];
  senses: WordSenseWritableV3[];
}

export interface DraftMeaningsStepContentWritableV3 {
  sense_groups: SenseGroupV3[];
  pos: WordPosMeaningsWritableV3[];
}

export interface EntryPresentationV3 {
  label: string;
  matched_surfaces: string[];
  strategy_version: string;
}

export type V3PublicationBlockCode =
  "phase2_consumers_not_ready" | "migration_canary_not_whitelisted";

export type V3PublicationCapability =
  | { mode: "native" }
  | {
      mode: "shadow_only";
      blocked_code: V3PublicationBlockCode;
    }
  | {
      mode: "migration_canary";
      whitelisted: boolean;
      blocked_code?: V3PublicationBlockCode;
    };

export interface AdminWordV3Capabilities {
  publication: V3PublicationCapability;
  pronunciation_normalization_version: PronunciationNormalizationVersionV3;
  /** Absent only when talking to a pre-capability backend. */
  sentence_associations?: boolean;
  /** Absent only when talking to a pre-capability backend. */
  sentence_target_discovery?: boolean;
  /** Absent only when talking to a pre-capability backend. */
  draft_relation_prebinding?: boolean;
}

export type LegacyHeadwordsCompatibilityV3 =
  | { mode: "unified"; common: string }
  | {
      mode: "distinguish";
      uk: string;
      us: string;
      source_dialect: SourceDialect;
    };

export interface AdminWordV3Compatibility {
  /** Response-only compatibility bridge; never a V3 canonical write field. */
  legacy_headwords: LegacyHeadwordsCompatibilityV3;
}

export interface AdminWordV3 {
  schema_version: 3;
  id: string;
  language: EnglishLanguageV3;
  kind: WordEntryKindV3;
  status: AdminWordStatus;
  revision: number;
  lifecycle_revision: number;
  has_unpublished_changes: boolean;
  presentation: EntryPresentationV3;
  capabilities: AdminWordV3Capabilities;
  detection_basis_dialect?: SourceDialect;
  compatibility?: AdminWordV3Compatibility;
  forms: DraftFormsStepContentV3;
  meanings: DraftMeaningsStepContentV3;
  /** 已通过完整性校验并由服务端标记完成；不表达页面访问权限。 */
  completed_steps: PersistedWordStep[];
  /** 列表“继续创建”的续做落点；V3 draft 导航不得把它当成 ACL。 */
  max_reachable_step: WordCreationStep;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  archived_by?: string;
  published_revision?: number;
  published_at?: string;
}

export type AdminWordAny = AdminWordV2 | AdminWordV3;

export interface AdminWordAnyEnvelope {
  word: AdminWordAny;
}

/** V3-only endpoint view used after narrowing an AdminWordAnyEnvelope. */
export interface AdminWordV3Envelope {
  word: AdminWordV3;
}

export type V3RetiredNodeRole =
  | "pos"
  | "form_group"
  | "group_membership"
  | "concrete_form"
  | "common_variant"
  | "uk_variant"
  | "us_variant"
  | "pronunciation"
  | "phrase_component_usage";

export interface RetiredStableNodeV3 {
  id: string;
  node_role: V3RetiredNodeRole;
  parent_node_id?: string;
  retired_at: string;
}

export interface AdminWordDraftV3Envelope {
  word: AdminWordV3;
  retired_stable_nodes: RetiredStableNodeV3[];
}

export type AdminWordDraftAnyEnvelope =
  AdminWordDraftV2Envelope | AdminWordDraftV3Envelope;

export interface CreateAdminWordV3Input {
  schema_version: 3;
  detection_id: string;
  kind: WordEntryKindV3;
  /** Step 1 最终确认值；兼容窗口内旧客户端可省略。 */
  headwords?: WordHeadwordsV2;
  confirmed_surface_match_token?: string;
}

export type CreateAdminWordAnyInput =
  CreateAdminWordV2Input | CreateAdminWordV3Input;

export interface SaveFormsStepInputV3 {
  schema_version: 3;
  base_revision: number;
  intent: StepSaveIntent;
  content: DraftFormsStepContentV3;
  confirmed_impact_token?: string;
  confirmed_surface_match_token?: string;
}

export type SaveFormsStepInputAny = SaveFormsStepInput | SaveFormsStepInputV3;

export interface SaveMeaningsStepInputV3 {
  schema_version: 3;
  base_revision: number;
  intent: StepSaveIntent;
  content: DraftMeaningsStepContentWritableV3;
}

export type SaveMeaningsStepInputAny =
  SaveMeaningsStepInput | SaveMeaningsStepInputV3;

export interface PreviewFormsImpactInputV3 {
  schema_version: 3;
  base_revision: number;
  content: DraftFormsStepContentV3;
}

export type PreviewFormsImpactInputAny =
  PreviewFormsImpactInputV2 | PreviewFormsImpactInputV3;

export interface ValidateAdminWordV3Input {
  schema_version: 3;
  base_revision: number;
}

export type ValidateAdminWordAnyInput =
  ValidateAdminWordV2Input | ValidateAdminWordV3Input;

export interface PublishAdminWordV3Input {
  schema_version: 3;
  base_revision: number;
  confirmed_surface_match_token?: string;
}

export type PublishAdminWordAnyInput =
  PublishAdminWordV2Input | PublishAdminWordV3Input;

export interface ActivatePublicationV3Input {
  schema_version: 3;
  base_revision: number;
  base_lifecycle_revision: number;
  confirmed_surface_match_token?: string;
}

export type ActivatePublicationAnyInput =
  ActivatePublicationInput | ActivatePublicationV3Input;

export const V3_VALIDATION_ISSUE_CODES = [
  "invalid_regional_variant_shape",
  "dialect_rules_invalid",
  "invalid_form_type_for_part_of_speech",
  "forbidden_v3_field",
  "duplicate_node_id",
  "duplicate_pos_code",
  "pos_required",
  "form_group_membership_invalid",
  "orphan_form",
  "form_group_required",
  "empty_form_group",
  "base_form_required_in_group",
  "variant_spelling_required",
  "pronunciation_required",
  "duplicate_pronunciation",
  "content_limit_exceeded",
  "sense_group_required",
  "sense_group_name_required",
  "sense_group_name_too_long",
  "pos_not_found",
  "duplicate_pos_meanings",
  "grammar_required",
  "grammar_variants_invalid",
  "sense_required",
  "level_invalid",
  "sub_pos_required",
  "invalid_sub_part_of_speech",
  "frequency_invalid",
  "sense_group_not_found",
  "definition_required",
  "definition_level_invalid",
  "definition_invalid",
  "native_definition_required",
  "sentence_level_invalid",
  "sentence_incomplete",
  "sentence_translation_required",
  "sentence_translation_invalid",
  "duplicate_sentence_translation_band",
  "sentence_link_role_invalid",
  "duplicate_sentence_link",
  "relation_score_invalid",
  "relation_type_invalid",
  "relation_self_target",
  "relation_target_archived",
  "relation_target_has_no_sense",
  "relation_target_unavailable",
  "relation_target_stale",
  "sentence_context_target_unavailable",
  "relation_pending_headword_invalid",
  "relation_target_shape_invalid",
  "relation_pending_gloss_without_headword",
  "relation_pending_gloss_invalid",
  "relation_pending_gloss_conflict",
  "relation_pending_gloss_target_exists",
  "relation_prebound_target_not_found",
  "relation_prebound_target_archived",
  "relation_prebound_target_has_no_sense",
  "relation_target_sense_deleted",
  "node_id_reused",
  "node_binding_unknown",
  "node_binding_changed",
  "meanings_storage_unsafe",
  "pos_meanings_required",
  "sense_has_inbound_publication_refs"
] as const;

export type V3ValidationIssueCode = (typeof V3_VALIDATION_ISSUE_CODES)[number];

export interface V3DraftNodeLocation {
  node_role: string;
  ancestor_node_ids: string[];
  pos_id?: string;
  form_group_id?: string;
  membership_id?: string;
  form_id?: string;
  form_type?: WordFormTypeV3;
  variant_id?: string;
  dialect?: Dialect;
  pronunciation_id?: string;
}

export interface V3DraftValidationIssue {
  schema_version: 3;
  step: PersistedWordStep;
  node_id: string;
  field: string;
  code: V3ValidationIssueCode;
  message: string;
  node_location: V3DraftNodeLocation;
}

export type DraftValidationIssueAny =
  DraftValidationIssueV2 | V3DraftValidationIssue;

export interface DraftValidationResponseV3 {
  schema_version: 3;
  validated_revision: number;
  valid: boolean;
  issues: V3DraftValidationIssue[];
}

export type DraftValidationResponseAny =
  DraftValidationResponse | DraftValidationResponseV3;

export type FormsImpactNodeTypeV3 =
  | "pos"
  | "form_group"
  | "membership"
  | "form"
  | "variant"
  | "pronunciation"
  | "phrase_component_usage"
  | "surface"
  | "publication"
  | "grammar_structure"
  | "text_variant"
  | "sense"
  | "definition"
  | "sentence"
  | "relation";

export interface FormsImpactItemV3 {
  node_id: string;
  node_type: FormsImpactNodeTypeV3;
  reason: string;
}

export interface FormsImpactResponseV3 {
  schema_version: 3;
  base_revision: number;
  requires_confirmation: boolean;
  affected: FormsImpactItemV3[];
  confirmation_token?: string;
  surface_match_page?: SurfaceMatchPageV3;
}

export type FormsImpactResponseAny =
  FormsImpactResponseV2 | FormsImpactResponseV3;

export type PreviewFormsImpactResponseV3 = FormsImpactResponseV3;

export interface DictionaryProviderEvidenceV3 {
  name: string;
  version: string;
}

export type DictionaryCoverageStateV3 = "complete" | "partial" | "missing";

export interface DictionaryCoverageV3 {
  forms: DictionaryCoverageStateV3;
  pronunciations: DictionaryCoverageStateV3;
  meanings: DictionaryCoverageStateV3;
  examples: DictionaryCoverageStateV3;
  frequency: DictionaryCoverageStateV3;
}

export interface DictionaryProvenanceV3 {
  forms?: DictionaryProviderEvidenceV3;
  pronunciations?: DictionaryProviderEvidenceV3;
  meanings?: DictionaryProviderEvidenceV3;
  examples?: DictionaryProviderEvidenceV3;
  frequency?: DictionaryProviderEvidenceV3;
}

export interface DictionaryPronunciationEvidenceV3 {
  dict_phonetic: string;
  actual_pron?: string;
  style?: PronunciationStyle;
}

interface SuggestedFormVariantBaseV3<TDialect extends Dialect> {
  dialect: TDialect;
  spelling: string;
  pronunciations: DictionaryPronunciationEvidenceV3[];
}

export type SuggestedCommonFormVariantV3 = SuggestedFormVariantBaseV3<"common">;
export type SuggestedUkFormVariantV3 = SuggestedFormVariantBaseV3<"uk">;
export type SuggestedUsFormVariantV3 = SuggestedFormVariantBaseV3<"us">;

export type SuggestedRegionalVariantsV3 =
  | { mode: "common"; common: SuggestedCommonFormVariantV3 }
  | {
      mode: "uk_us";
      uk: SuggestedUkFormVariantV3;
      us: SuggestedUsFormVariantV3;
    };

export interface SuggestedConcreteFormV3 {
  pos: string;
  form_type: WordFormTypeV3;
  regional_variants: SuggestedRegionalVariantsV3;
}

export type BuiltinDictionaryEvidenceV3 =
  | {
      status: "matched";
      provider: DictionaryProviderEvidenceV3;
      suggested_pos: string[];
      suggested_forms: SuggestedConcreteFormV3[];
      coverage: DictionaryCoverageV3;
      provenance: DictionaryProvenanceV3;
    }
  | { status: "not_found" }
  | { status: "unavailable"; retry_after_seconds?: number };

export interface DetectLexiconSurfaceV3Input {
  schema_version: 3;
  language: EnglishLanguageV3;
  kind: WordEntryKindV3;
  surface: string;
}

export type DetectLexiconInputAny =
  DetectWordInputV2 | DetectLexiconSurfaceV3Input;

export interface DetectionSurfaceRequestEchoV3 {
  language: EnglishLanguageV3;
  kind: WordEntryKindV3;
  surface: string;
}

export interface DetectLexiconSurfaceResponseV3 {
  schema_version: 3;
  detection_id: string;
  expires_at: string;
  request: DetectionSurfaceRequestEchoV3;
  normalized_surface: string;
  builtin_dictionary: BuiltinDictionaryEvidenceV3;
  /** Server-authoritative union of builtin and same-surface existing-entry POS suggestions. */
  suggested_pos: string[];
  matches: SurfaceMatchItemV3[];
  requires_acknowledgement: boolean;
  surface_match_page?: SurfaceMatchPageV3;
}

export type DetectLexiconResponseAny =
  DetectWordResponseV2 | DetectLexiconSurfaceResponseV3;

export interface AdminWordListItemV3 {
  schema_version: 3;
  id: string;
  kind: WordEntryKindV3;
  presentation: EntryPresentationV3;
  /**
   * 方言摘要，后端按词性**当前**设置聚合：任一词性区分英美拼写 → `["uk", "us"]`，
   * 否则 `["common"]`；还没有词性的空白草稿为空数组。建条 step 1 的选择只是初始快照。
   */
  dialects: Dialect[];
  revision: number;
  lifecycle_revision: number;
  gloss: string;
  pos_list: string[];
  levels: string[];
  status: AdminWordStatus;
  has_unpublished_changes: boolean;
  /** 列表“继续创建”的续做落点；V3 draft 导航不得把它当成 ACL。 */
  max_reachable_step: WordCreationStep;
  published_revision?: number;
  created_by_name: string;
  /** 创建人 admin id；判定「仅本人可删」的归属依据（姓名会因重名误判）。 */
  created_by: string;
  /** 被引用汇总；total 为 0 即无人引用、可安全清理。 */
  reference_summary: EntryReferenceSummary;
  created_at: string;
  updated_at: string;
}

export type AdminWordListItemAny = AdminWordV2ListItem | AdminWordListItemV3;

/** Mixed-version list response from the current OpenAPI. */
export interface AdminWordListResponseAny {
  words: AdminWordListItemAny[];
  page: AdminWordListPage;
}

export interface AdminWordV3ListResponse {
  words: AdminWordListItemV3[];
  page: AdminWordListPage;
}

export interface RelatedWordMatchV3 {
  pos_id: string;
  form_id: string;
  variant_id: string;
  form_type: WordFormTypeV3;
  dialect: Dialect;
  spelling: string;
}

export interface RelatedWordSenseV3 {
  sense_id: string;
  gloss: string;
}

export interface RelatedWordResultV3 {
  schema_version: 3;
  entry_id: string;
  kind: WordEntryKindV3;
  status?: "draft" | "published";
  presentation: EntryPresentationV3;
  matches: RelatedWordMatchV3[];
  senses: RelatedWordSenseV3[];
}

export type RelatedWordResultAny = RelatedWordResult | RelatedWordResultV3;

export interface RelatedSearchLegacyResponseAny {
  results: RelatedWordResultAny[];
}

export interface RelatedSearchV2ResponseAny {
  results: RelatedWordResultAny[];
  total: number;
  next_cursor: string | null;
}

export type RelatedSearchResponseAny =
  RelatedSearchLegacyResponseAny | RelatedSearchV2ResponseAny;

interface AdminWordPublicationBase {
  publication_id: string;
  entry_id: string;
  publication_number: number;
  source_revision: number;
  published_by_admin_id: string;
  published_at: string;
  is_current: boolean;
}

export interface AdminWordPublicationV2 extends AdminWordPublicationBase {
  schema_version: 2;
  word: AdminWordV2;
}

export interface AdminWordPublicationV3 extends AdminWordPublicationBase {
  schema_version: 3;
  word: AdminWordV3;
}

export type AdminWordPublicationAny =
  AdminWordPublicationV2 | AdminWordPublicationV3;

export interface AdminWordPublicationEnvelope {
  publication: AdminWordPublicationAny;
}

export interface AdminWordPublicationListResponse {
  publications: AdminWordPublicationAny[];
}

export interface EntryLifecycleBatchResponseAny {
  words: AdminWordAny[];
  affected: number;
}
