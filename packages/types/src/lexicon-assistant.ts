import type { WordCreationStep } from "./admin-word-v2";

export interface LexiconAssistantHistory {
  role: "user" | "assistant";
  content: string;
}

export interface LexiconAssistantInput {
  entry_id: string;
  base_revision: number;
  context_id: string;
  step: WordCreationStep;
  local_content: string;
  context_truncated: boolean;
  question: string;
  history: LexiconAssistantHistory[];
}

export interface LexiconAssistantSource {
  kind: "smart_lexicon" | "builtin_dictionary" | "filling_rules";
  label: string;
  entry_id: string | null;
  version: string | null;
  truncated: boolean;
}

export interface LexiconAssistantUsage {
  model: string;
  model_calls: number;
  tool_calls: number;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface LexiconAssistantResponse {
  entry_id: string;
  context_id: string;
  answer: string;
  sources: LexiconAssistantSource[];
  usage: LexiconAssistantUsage;
  requires_human_review: boolean;
}

export interface LexiconAssistantCapability {
  available: boolean;
}

export interface LexiconFormCandidatesInput {
  entry_id: string;
  base_revision: number;
  context_id: string;
  catalog_version: number;
  headword: string;
  local_content: string;
}
export interface AssistantCandidateVariant {
  spelling: string;
  dict_phonetic: string;
}
export interface AssistantCandidateForm {
  form_type: string;
  is_regular: boolean;
  uk: AssistantCandidateVariant;
  us: AssistantCandidateVariant;
}
export interface AssistantCandidatePos {
  pos: string;
  forms: AssistantCandidateForm[];
}
export interface LexiconFormCandidatesResponse {
  entry_id: string;
  base_revision: number;
  context_id: string;
  catalog_version: number;
  headword: string;
  pos: AssistantCandidatePos[];
  notes: string[];
  usage: LexiconAssistantUsage;
  requires_human_review: boolean;
}

export type LexiconAssistantEvent =
  | { event: "status"; message: string }
  | { event: "delta"; text: string }
  | { event: "reset" }
  | { event: "complete"; response: LexiconAssistantResponse }
  | { event: "failed"; status: number };
