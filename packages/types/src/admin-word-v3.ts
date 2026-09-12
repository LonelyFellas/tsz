import type { EntryAnnotationUpdate } from "./entry-annotation";
import type { RichTextEmphasisLevel } from "./rich-text";
import type {
  AdminWordListPage,
  AdminWordStatus,
  Dialect,
  PronunciationStyle,
  RelatedWordResult,
  SourceDialect
} from "./admin-word";
import type {
  ActivatePublicationInput,
  AdminWordV2,
  CreateAdminWordV2Input,
  DetectWordInputV2,
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
export type WordFormTypeV3 = string;

export interface WordPronunciationV3 {
  id: string;
  dict_phonetic: string;
  dict_phonetic_rich?: RichTextV3;
  voice_profile?: VoiceProfileV3;
  audio_assets?: AudioAssetV3[];
  actual_pron: string;
  /** 编辑器正文与 actual_pron 一致。连读只标在这里，字典音标那侧只喂语音合成。 */
  actual_pron_rich?: RichTextV3;
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
      /** 缺省 = 目标是从未发布的草稿：保存 / 发布按目标当前草稿内容校验；目标发布后由服务端补上。 */
      target_publication_id?: string;
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
      level: RichTextEmphasisLevel;
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
      /** 起点锚点占几个码点（默认 1）；多字母锚点靠它还原。 */
      start_len?: number;
      /** 终点锚点占几个码点（默认 1）。 */
      end_len?: number;
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
  /**
   * 缺省 / null 表示未配置。例句英文与释义内容目前还没接语音编辑器，
   * 这里先留着，等它们接入时用。
   */
  voice_profile?: VoiceProfileV3 | null;
  /** 与 GrammarVariantV3 同形预留；例句 / 释义接入语音编辑器前 admin 不写入。 */
  audio_assets?: AudioAssetV3[];
  /** 人工正文关联。省略保留存量，显式空数组清除。 */
  text_links?: TextLinkV3[];
}

export interface TextLinkViaPhraseV3 {
  word_id: string;
  /** 缺省 = 该短语还是从未发布的草稿。 */
  publication_id?: string;
  sense_id: string;
  component_id: string;
}

export interface TextLinkV3 {
  id: string;
  source_segments: SentenceSourceRangeV3[];
  target_word_id: string;
  /** 缺省 = 目标是从未发布的草稿：发布引用记 draft 范围；目标发布后宿主下次保存 / 发布由服务端补上。 */
  target_publication_id?: string;
  target_pos_id: string;
  target_base_form_id: string;
  target_form_id: string;
  target_variant_id: string;
  target_sense_id: string;
  via_phrase?: TextLinkViaPhraseV3;
  /** 服务端生成；保存请求不发送。 */
  target_headword?: string;
  target_gloss?: string;
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
  name_en_rich?: RichTextV3;
  voice_profile?: VoiceProfileV3;
}

/** 单个音色的启用选择与独立语速；未启用时仍保留语速。 */
export interface VoiceSettingV3 {
  voice_id: string;
  enabled: boolean;
  rate_percent: number;
}

/** 未出现的音色默认不勾选、原速；voice_id 使用目录 alias。 */
export interface VoiceProfileV3 {
  voices: VoiceSettingV3[];
}

export type AudioAssetLocaleV3 = "en-GB" | "en-US";
export type AudioAssetGenderV3 = "female" | "male";

/**
 * 一条已上传的音频资产（真人录音）。元数据由服务端在 confirm 时生成，前端原样回传；
 * 不含可播放 URL——试听要按 id 另取短期签名 URL，签名 URL 不进 aggregate / publication。
 * 契约见 docs/features/voice-editor-audio-upload/design.md「后端对接」。
 */
export interface AudioAssetV3 {
  id: string;
  locale: AudioAssetLocaleV3;
  gender: AudioAssetGenderV3;
  content_type: string;
  size_bytes: number;
  /** 服务端能探到时长才有。 */
  duration_ms?: number | null;
  /** 上传时的原始文件名，仅作展示。 */
  original_name: string;
  created_at: string;
}

export interface GrammarVariantV3 {
  id: string;
  dialect: Dialect;
  content: RichTextV3;
  /** 缺省 / null 表示未配置：按系统默认音色与原速处理。 */
  voice_profile?: VoiceProfileV3 | null;
  /** 挂在这段文本上的真人录音；缺省 / 空数组 = 没有音频。 */
  audio_assets?: AudioAssetV3[];
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

/**
 * 译文风格而非难度等级：初阶逐字直译、中阶语句通顺、高阶深层重构。
 * 同一例句的同档译文可以有多条。
 */
export type SentenceTranslationBandV3 =
  "word_for_word" | "balanced_fluency" | "adapted_creation";

/** 译文语言。现阶段只开放汉语，结构为将来的多语言译文预留。 */
export type TranslationLanguageV3 = "zh";

export interface WordSentenceTranslationV3 {
  id: string;
  band: SentenceTranslationBandV3;
  content: RichTextV3;
  /**
   * 缺省按汉语处理，因而在 wire 上非必填。
   * 后端 2026-09-12 上线之前发布的历史快照里没有这个键（发布快照原样返回、不经规范化）。
   */
  language?: TranslationLanguageV3;
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
  /** 与候选行同一个发布版本；草稿候选缺省。 */
  publication_id?: string;
  pos_id: string;
  base_form_id: string;
  level: string;
  gloss: string;
  /** 目标释义自己的成分用词（释义级）。B1 起返回；缺失时退回候选级 component_usages。 */
  component_usages?: PhraseComponentUsageV3[];
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
  /** 命中的发布版本。缺省即草稿候选（只在 `include_drafts` 时出现）。 */
  publication_id?: string;
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
  /** 上一页返回的 `next_cursor`；换了关键字/kind/match/include_drafts 或词面数据变动后即失效（400 invalid_query）。 */
  cursor?: string;
  /**
   * 匹配方式。缺省 `contains` = 词面包含关键字；`exact` = 关键字归一化后与词形等值，
   * 屈折词形（jobs / gave）照样命中原形词条。例句里点词做关联要用 `exact`。
   */
  match?: "contains" | "exact";
  /** 把从未发布的 V3 草稿词条（不限创建者）也列为候选；草稿候选没有 `publication_id`。 */
  include_drafts?: boolean;
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
  pending_target_headword?: string;
  pending_target_gloss?: string;
  target_headword?: string;
  target_gloss?: string;
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
  /** 短语成分用词（释义级）。后端 B1 起在非空时返回；旧后端不返回。 */
  component_usages?: PhraseComponentUsageV3[];
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
  /** 未显式绑定的关联词词面；保存和发布后仍为纯文本。 */
  pending_target_headword?: string;
  /** 未显式绑定的关联词词义；仅保存文本，不触发词条创建或关联。 */
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
  /** 仅当 capabilities.sense_component_usages === true 时发送。 */
  component_usages?: PhraseComponentUsageV3[];
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

export type V3PublicationCapability = { mode: "native" };

export interface AdminWordV3Capabilities {
  text_links?: boolean;
  publication: V3PublicationCapability;
  pronunciation_normalization_version: PronunciationNormalizationVersionV3;
  /** Absent only when talking to a pre-capability backend. */
  sentence_associations?: boolean;
  /** Absent only when talking to a pre-capability backend. */
  sentence_target_discovery?: boolean;
  /** Absent only when talking to a pre-capability backend. */
  draft_relation_prebinding?: boolean;
  /** 释义级成分用词（B1 起恒 true）；缺失表示后端尚不支持，前端不得发送 sense.component_usages。 */
  sense_component_usages?: boolean;
}

export interface AdminWordV3 {
  schema_version: 3;
  id: string;
  language: EnglishLanguageV3;
  kind: WordEntryKindV3;
  status: AdminWordStatus;
  revision: number;
  lifecycle_revision: number;
  /** 同原型词条的区分标签（≤ 20 个 Unicode scalar），未标注为 null。 */
  annotation: string | null;
  /** 标注独立修订；`PATCH /entries/{id}/annotation` 以此做乐观锁，与内容 revision 无关。 */
  annotation_revision: number;
  has_unpublished_changes: boolean;
  presentation: EntryPresentationV3;
  capabilities: AdminWordV3Capabilities;
  detection_basis_dialect?: SourceDialect;
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

export interface CreateAdminWordV3Input {
  schema_version: 3;
  detection_id: string;
  kind: WordEntryKindV3;
  /** Step 1 最终确认值；兼容窗口内旧客户端可省略。 */
  headwords?: WordHeadwordsV2;
  confirmed_surface_match_token?: string;
  /** 新词条标注；与已有词条同原型时必填，否则可省略。 */
  annotation?: string | null;
  /** 同原型已有词条的标注（含未改动的），须带上各自当前 annotation_revision。 */
  annotation_updates?: EntryAnnotationUpdate[];
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
  "sense_has_inbound_publication_refs",
  "phrase_component_not_allowed",
  "phrase_component_limit_exceeded",
  "phrase_component_literal_invalid",
  "phrase_component_self_target",
  "phrase_component_target_unavailable",
  "phrase_component_target_nested",
  "phrase_component_target_stale",
  "phonetic_rich_text_invalid",
  "voice_profile_invalid",
  "audio_asset_invalid"
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

export interface DraftValidationResponseV3 {
  schema_version: 3;
  validated_revision: number;
  valid: boolean;
  issues: V3DraftValidationIssue[];
}

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
  /** Own unfinished draft without saved surface sources; not a surface match. */
  existing_draft_id?: string;
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

export interface AdminWordListItemV3 {
  annotation_visible: boolean;
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
  /** 同原型词条的区分标签（≤ 20 个 Unicode scalar），未标注为 null。 */
  annotation: string | null;
  /** 标注独立修订；`PATCH /entries/{id}/annotation` 以此做乐观锁，与内容 revision 无关。 */
  annotation_revision: number;
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

export type AdminWordListItemAny = AdminWordListItemV3;

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

export type AdminWordPublicationAny = AdminWordPublicationV3;

export interface AdminWordPublicationEnvelope {
  publication: AdminWordPublicationAny;
}

export interface AdminWordPublicationListResponse {
  publications: AdminWordPublicationAny[];
}

export interface EntryLifecycleBatchResponse {
  words: AdminWordV3[];
  affected: number;
}
