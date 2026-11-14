import type { RichTextV3, SharedFormsStepContentV3 } from "./admin-word-v3";

/** Independent lexicon-next identities; the forms editor shares the V1 content contract. */
export interface NextForm {
  id: string;
  locale: string;
  text: string;
}
export interface NextDefinition {
  grammar_structure_id?: string;
  id: string;
  locale: string;
  text: string;
  style: "definition" | "sentence";
}
export interface NextEquivalent {
  id: string;
  locale: string;
  text: string;
}
export interface NextSenseGroup {
  id: string;
  name_zh: string;
  name_en: string;
}
export interface NextSense {
  sub_pos?: string;
  sense_group_id?: string;
  id: string;
  part_of_speech: string | null;
  definitions: NextDefinition[];
  equivalents: NextEquivalent[];
}
export interface NextGrammarVariant {
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
export interface NextEntry {
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
export interface NextEntryMatchInput extends NextDetectionInput {
  medium_locale?: string;
  page?: number | null;
  page_size?: number | null;
}
export interface NextEntryMatches {
  surface: string;
  items: NextWorkspaceEntry[];
  pagination: NextEntryList["pagination"];
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
  grammar_structures?: boolean;
  medium_ownership?: boolean;
  schema_version: 1;
  language_rules_version: string;
  languages: NextLanguageCapability[];
  manual_drafts: boolean;
  generation: boolean;
  publishing: boolean;
  form_editor?: boolean;
  sense_groups?: boolean;
}
export interface NextViewQuery {
  target_locale: string;
  medium_locale: string;
}
export interface NextSenseView {
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
  created_from?: string;
  created_to?: string;
}
export interface NextWorkspaceEntry extends NextEntrySummary {
  status: "draft" | "archived";
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
