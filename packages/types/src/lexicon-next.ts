/** Independent lexicon-next wire model; never an AdminWordV3 conversion. */
export interface NextForm {
  id: string;
  locale: string;
  text: string;
}
export interface NextDefinition {
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
export interface NextSense {
  id: string;
  part_of_speech: string | null;
  definitions: NextDefinition[];
  equivalents: NextEquivalent[];
}
export interface NextDraft {
  schema_version: 1;
  headword: string;
  forms: NextForm[];
  senses: NextSense[];
}
export interface NextEntry {
  id: string;
  target_language: string;
  kind: "word" | "phrase";
  owner_id: string;
  revision: number;
  updated_at: string;
  draft: NextDraft;
}
export interface CreateNextEntry {
  target_language: string;
  kind: "word" | "phrase";
  headword: string;
}
export interface NextListQuery {
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
  schema_version: 1;
  language_rules_version: string;
  languages: NextLanguageCapability[];
  manual_drafts: boolean;
  generation: boolean;
  publishing: boolean;
}
export interface NextViewQuery {
  target_locale: string;
  medium_locale: string;
}
export interface NextSenseView {
  id: string;
  target_definitions: NextDefinition[];
  medium_definitions: NextDefinition[];
  equivalents: NextEquivalent[];
  missing_target_definitions: boolean;
  missing_medium_definitions: boolean;
  missing_equivalents: boolean;
}
export interface NextEntryView {
  entry_id: string;
  revision: number;
  target_locale: string;
  medium_locale: string;
  forms: NextForm[];
  missing_forms: boolean;
  senses: NextSenseView[];
}
