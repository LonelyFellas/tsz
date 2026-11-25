import type { LexiconTaxonomy } from "./lexicon-taxonomies";
import type {
  AudioAssetV3,
  EntryNameVariantV3,
  VoiceProfileV3,
  RichTextV3,
  GrammarFormLinkV3,
  WordRelationWritableV3,
  SharedFormsStepContentV3
} from "./admin-word-v3";
import type { SharedSentenceAnnotation } from "./shared-sentences";

/** Independent lexicon-next identities; the forms editor shares the V1 content contract. */
export interface NextForm {
  id: string;
  locale: string;
  text: string;
}
export interface NextDefinition {
  level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  /** true = explicitly unbound; omitted = not selected. */
  grammar_unbound?: true;
  content?: RichTextV3;
  voice_profile?: VoiceProfileV3;
  audio_assets?: AudioAssetV3[];
  grammar_structure_id?: string;
  id: string;
  locale: string;
  text: string;
  style: "definition" | "sentence";
}
export interface NextEquivalent {
  metadata?: NextEquivalentMetadata;
  id: string;
  locale: string;
  text: string;
}
export interface NextEquivalentMetadata {
  register_ids: string[];
  domain_ids: string[];
  commonness: NextEquivalentScore[];
}
export interface NextEquivalentScore {
  domain_id?: string;
  score: string;
  assessed_at?: string;
}
export interface NextEquivalentCatalog {
  registers: LexiconTaxonomy[];
  domains: LexiconTaxonomy[];
}
export interface NextSenseGroup {
  id: string;
  name_zh: string;
  name_en: string;
}
export interface NextSense {
  relations?: WordRelationWritableV3[];
  sentence_ids?: string[];
  no_equivalents?: string[];
  level?: string;
  frequency?: string;
  depends_on_context?: boolean;
  sub_pos?: string;
  sense_group_id?: string;
  id: string;
  part_of_speech: string | null;
  definitions: NextDefinition[];
  equivalents: NextEquivalent[];
}
export interface NextGrammarVariant {
  voice_profile?: VoiceProfileV3;
  audio_assets?: AudioAssetV3[];
  form_links?: GrammarFormLinkV3[];
  id: string;
  locale: string;
  content: RichTextV3;
}
export interface NextGrammarStructure {
  id: string;
  part_of_speech: string;
  sub_pos?: string;
  variants: NextGrammarVariant[];
}
export interface NextGrammarIssue {
  node_id: string;
  field: string;
  message: string;
}
export interface NextDraft {
  grammar_structures?: NextGrammarStructure[];
  sense_groups?: NextSenseGroup[];
  schema_version: 1;
  headword: string;
  forms: NextForm[];
  senses: NextSense[];
  form_editor?: SharedFormsStepContentV3;
}
export type NextDialectUsage = "general" | "en-GB" | "en-US";
export interface NextDialectTarget {
  entry_id: string;
  sense_id: string;
  revision: number;
}
export interface NextDialectPeer extends NextDialectTarget {
  headword: string;
  part_of_speech: string | null;
  gloss: string;
}
export interface NextDialectSense {
  sense_id: string;
  usage: NextDialectUsage;
  no_equivalent: boolean;
  note: string;
  paired: boolean;
  target: NextDialectPeer | null;
}
export interface NextDialectChange {
  sense_id: string;
  usage: NextDialectUsage;
  no_equivalent: boolean;
  note: string;
  target: NextDialectTarget | null;
  previous_target_revision: number | null;
}
export interface NextEntry {
  creation_detection?: NextDetection;
  dialect_senses?: NextDialectSense[];
  sentence_resources?: NextSentence[];
  id: string;
  medium_locale?: string;
  target_language: string;
  kind: "word" | "phrase";
  owner_id: string;
  revision: number;
  updated_at: string;
  draft: NextDraft;
}
export interface CreateNextEntry {
  target_language: string;
  medium_locale: string;
  kind: "word" | "phrase";
  headword: string;
  creation_detection?: NextDetection;
}
export interface NextDetectionInput {
  target_language: string;
  surface: string;
}
export interface NextDictionaryMatch {
  id: string;
  term: string;
  part_of_speech: string;
  glosses: string[];
  forms: { text: string; tags: string[] }[];
  phonetics: { ipa: string; tags: string[] }[];
  source_name: string;
  source_version: string;
}
export interface NextDetection {
  surface: string;
  kind: "word" | "phrase";
  matches: NextDictionaryMatch[];
}
export interface NextDictionaryPosMapping {
  source_code: string;
  part_of_speech: string;
  sub_pos?: string;
  base_form_only: boolean;
}
export interface NextDetectionResult extends NextDetection {
  part_of_speech_mappings?: NextDictionaryPosMapping[];
}
export interface NextEntryMatchInput extends NextDetectionInput {
  medium_locale?: string;
  page?: number | null;
  page_size?: number | null;
}
export interface NextEntryMatches {
  surface: string;
  items: NextWorkspaceEntry[];
  pagination: NextEntryList["pagination"];
  annotation_required?: boolean;
  annotation_items?: NextWorkspaceEntry[];
}
export interface NextListQuery {
  target_language?: string;
  medium_locale?: string;
  headword?: string;
  kind?: "word" | "phrase";
  page?: number;
  page_size?: number;
}
export interface NextEntrySummary {
  id: string;
  target_language: string;
  kind: "word" | "phrase";
  headword: string;
  owner_id: string;
  revision: number;
  updated_at: string;
  part_of_speech: string[];
  gloss: string | null;
}
export interface NextEntryList {
  items: NextEntrySummary[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}
export interface SaveNextDraft {
  dialect_changes?: NextDialectChange[];
  sentence_changes?: NextSentenceDraftChange[];
  expected_revision: number;
  /** Complete draft across all locales; omission removes a current node. */
  draft: NextDraft;
}
export interface NextLanguageCapability {
  target_language: string;
  target_locales: string[];
  medium_locales: string[];
  common_target_locale: string;
  part_of_speech_codes: string[];
}
export interface NextCapabilities {
  creation_snapshot?: boolean;
  dialect_pairs?: boolean;
  sentence_drafts?: boolean;
  relations?: boolean;
  sentence_details?: boolean;
  definition_details?: boolean;
  sentences?: boolean;
  equivalent_metadata?: boolean;
  sense_metadata?: boolean;
  grammar_audio?: boolean;
  grammar_form_links?: boolean;
  sentence_associations?: boolean;
  grammar_structures?: boolean;
  medium_ownership?: boolean;
  schema_version: 1;
  language_rules_version: string;
  languages: NextLanguageCapability[];
  manual_drafts: boolean;
  generation: boolean;
  generation_candidates?: boolean;
  section_generation_candidates?: boolean;
  publishing: boolean;
  form_editor?: boolean;
  sense_groups?: boolean;
}
export interface NextDraftSchemaCompatibility {
  draft_schema_version: number;
  supported_draft_schema_versions: number[];
}
export interface NextViewQuery {
  target_locale: string;
  medium_locale: string;
}
export interface NextSenseView {
  relations?: WordRelationWritableV3[];
  sentence_ids?: string[];
  no_equivalents?: boolean;
  level?: string;
  frequency?: string;
  depends_on_context?: boolean;
  sense_group_id?: string;
  id: string;
  target_definitions: NextDefinition[];
  medium_definitions: NextDefinition[];
  equivalents: NextEquivalent[];
  missing_target_definitions: boolean;
  missing_medium_definitions: boolean;
  missing_equivalents: boolean;
}
export interface NextEntryView {
  dialect_senses?: NextDialectSense[];
  sentence_resources?: NextSentence[];
  grammar_structures?: NextGrammarStructure[];
  grammar_issues?: NextGrammarIssue[];
  sense_groups?: NextSenseGroup[];
  entry_id: string;
  revision: number;
  target_locale: string;
  medium_locale: string;
  forms: NextForm[];
  missing_forms: boolean;
  senses: NextSenseView[];
}

/** List management has a separate endpoint; language draft responses stay compatible. */
export interface NextWorkspaceQuery extends NextListQuery {
  gloss?: string;
  pos?: string;
  level?: string;
  status?: "draft" | "published" | "archived";
  created_by?: string;
  updated_by?: string;
  created_from?: string;
  created_to?: string;
}
export interface NextWorkspaceEntry extends NextEntrySummary {
  /** 列表中的已保存原形，旧服务可能省略。 */
  name_variants?: EntryNameVariantV3[];
  levels?: string[];
  status: "draft" | "published" | "archived";
  lifecycle_revision: number;
  created_at: string;
  created_by_name: string;
  updated_by_name: string;
  annotation: string | null;
  annotation_revision: number;
  annotation_visible: boolean;
  forms: NextForm[];
}
export interface NextWorkspaceList {
  items: NextWorkspaceEntry[];
  pagination: NextEntryList["pagination"];
}
export interface NextWorkspaceStats {
  total: number;
  today: number;
  month: number;
}
export interface NextWorkspaceCreator {
  id: string;
  display_name: string;
}
export interface NextListTarget {
  entry_id: string;
  base_revision: number;
  base_lifecycle_revision: number;
}
export interface NextListCommand {
  request_id: string;
  action: "archive" | "restore" | "delete";
  items: NextListTarget[];
}
export interface NextListCommandResult {
  entry_ids: string[];
}
export interface NextAnnotationInput {
  annotation: string | null;
  base_annotation_revision: number;
}
export interface NextAnnotationResult {
  entry_id: string;
  annotation: string | null;
  annotation_revision: number;
}

export type NextSentenceTranslationStyle =
  "word_for_word" | "balanced_fluency" | "adapted_creation";
export interface NextSentenceSource {
  id: string;
  source_type:
    "dictionary" | "web" | "adapted" | "ai_composed" | "human_composed";
  title: string;
  url: string;
  locator: string;
}
export interface NextSentenceMetadata {
  register_ids: string[];
  domain_ids: string[];
  sources: NextSentenceSource[];
}
export interface NextSentenceTranslationMetadata {
  freedom?: number | null;
  sources: NextSentenceSource[];
}
export interface NextSentenceTranslation {
  id: string;
  locale: string;
  style: NextSentenceTranslationStyle;
  content: RichTextV3;
  metadata?: NextSentenceTranslationMetadata;
}
export interface NextSentenceVariant {
  id: string;
  locale: string;
  level: string;
  content: RichTextV3;
  translations: NextSentenceTranslation[];
  associations?: SharedSentenceAnnotation[];
  metadata?: NextSentenceMetadata;
  voice_profile?: VoiceProfileV3;
  audio_assets?: AudioAssetV3[];
}
export interface NextSentence {
  id: string;
  target_language: string;
  owner_id: string;
  revision: number;
  updated_at: string;
  reference_count: number;
  draft: { schema_version: 1; variants: NextSentenceVariant[] };
}
export interface CreateNextSentence {
  id: string;
  target_language: string;
  target_locale: string;
  medium_locale: string;
  variant: NextSentenceVariant;
}
export interface SaveNextSentence {
  expected_revision: number;
  target_locale: string;
  medium_locale: string;
  variant: NextSentenceVariant;
}
export interface NextSentenceQuery {
  target_language: string;
  target_locale: string;
  medium_locale: string;
  keyword?: string;
  level?: string;
  page?: number;
  page_size?: number;
}
export interface NextSentenceListItem {
  id: string;
  owner_id: string;
  revision: number;
  updated_at: string;
  reference_count: number;
  locale: string;
  level: string;
  content: RichTextV3;
  translation_count: number;
}
export interface NextSentenceList {
  items: NextSentenceListItem[];
  pagination: NextEntryList["pagination"];
}

export interface NextSentenceDraftChange {
  id: string;
  expected_revision?: number | null;
  target_locale: string;
  medium_locale: string;
  variant: NextSentenceVariant;
}

export interface NextPublicationBase {
  base_revision: number;
  base_lifecycle_revision: number;
}
export interface NextPublishInput extends NextPublicationBase {
  request_id: string;
  preview_token: string;
}
export interface NextPublicationIssue {
  node_id: string;
  field: string;
  message: string;
}
export interface NextPublicationPreview {
  entry_id: string;
  revision: number;
  lifecycle_revision: number;
  preview_token: string;
  issues: NextPublicationIssue[];
  warnings: NextPublicationIssue[];
  can_publish: boolean;
}
export interface NextPublication {
  id: string;
  entry_id: string;
  revision: number;
  lifecycle_revision: number;
  published_by_admin_id: string;
  published_at: string;
  snapshot: {
    draft: NextDraft;
    sentence_resources: NextSentence[];
    relation_targets: {
      entry_id: string;
      sense_id: string;
      publication_id: string;
      headword: string;
      forms: NextForm[];
      gloss: string;
    }[];
  };
}
export interface NextPublicationState {
  dialect_senses?: NextDialectSense[];
  entry_id: string;
  status: "draft" | "published" | "archived";
  lifecycle_revision: number;
  has_unpublished_changes: boolean;
  current: NextPublication | null;
}
