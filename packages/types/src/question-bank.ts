import type { CoinEntryPage } from "./coins";

export interface QuestionSource {
  entry_id: string;
  publication_id: string;
  pos_id: string;
  sense_id: string;
  definition_id: string;
  form_id: string;
}
export interface QuestionCandidate {
  candidate_ref: string;
  source: QuestionSource;
  content_fingerprint: string;
  spelling: string;
  part_of_speech: string;
  level: string;
  definition: string;
  other_definitions: string[];
  accepted_spellings: string[];
  answer_profile: string;
  form_type: string;
  teaching_eligible: boolean;
}
export interface QuestionCandidatePage {
  contract_version: number;
  items: QuestionCandidate[];
}
export interface QuestionCandidateQuery {
  entry_id?: string;
  query?: string;
  question_level: string;
  answer_profile: string;
}
export interface QuestionEntryRead {
  candidate_ref: string;
  source: QuestionSource;
  answer_profile: string;
}
export interface CreateQuestionGeneration {
  idempotency_key: string;
  target: QuestionEntryRead;
  question_level: string;
  answer_profile: string;
}
export type QuestionGenerationState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "insufficient_candidates";
export interface QuestionGeneration {
  id: string;
  state: QuestionGenerationState;
  revision: number;
  created_by: string;
  question_level: string;
  answer_profile: string;
  target: QuestionCandidate;
  agent_run_id: string | null;
  question_id: string | null;
  error_code: string | null;
  reasons: string[];
  created_at: string;
  updated_at: string;
}
export interface BankQuestionOption {
  option_id: string;
  candidate: QuestionCandidate;
  explanation: string;
}
export interface BankQuestionContent {
  target: QuestionCandidate;
  prompt: string;
  question_level: string;
  answer_profile: string;
  options: BankQuestionOption[];
  correct_option_id: string;
  explanation: string;
  concerns: string[];
}
export type BankQuestionState = "draft" | "approved" | "rejected" | "disabled";
export interface BankQuestion {
  id: string;
  generation_id: string;
  revision: number;
  state: BankQuestionState;
  content: BankQuestionContent;
  original_content: BankQuestionContent;
  created_by: string;
  reviewed_by: string | null;
  review_comment: string;
  created_at: string;
  updated_at: string;
}
export interface EditBankQuestion {
  expected_revision: number;
  prompt: string;
  options: QuestionEntryRead[];
  option_explanations: string[];
  explanation: string;
}
export type QuestionReviewReason =
  | "ambiguous"
  | "weak_distractor"
  | "level_mismatch"
  | "source_error"
  | "prompt_unclear"
  | "explanation_error"
  | "other";
export interface ReviewBankQuestion {
  expected_revision: number;
  decision: "approve" | "reject" | "disable";
  reason_codes: QuestionReviewReason[];
  comment: string;
}
export interface QuestionBankQuery {
  page?: number;
  page_size?: number;
  state?: string;
}
export interface BankQuestionPage {
  items: BankQuestion[];
  pagination: CoinEntryPage["pagination"];
}
export interface QuestionGenerationPage {
  items: QuestionGeneration[];
  pagination: CoinEntryPage["pagination"];
}

export interface QuestionCandidateSearchPage {
  items: QuestionCandidate[];
  pagination: CoinEntryPage["pagination"];
}
export interface QuestionCandidatePageQuery extends QuestionCandidateQuery {
  page?: number;
  page_size?: number;
}
export interface QuestionBatchSelection {
  question_levels: string[];
  answer_profiles: string[];
}
export interface QuestionBatchCoverage {
  question_level: string;
  answer_profile: string;
  eligible: number;
  covered: number;
  generating: number;
  missing: number;
}
export interface QuestionBatchPreview {
  selection: QuestionBatchSelection;
  coverage: QuestionBatchCoverage[];
  missing: number;
  preview_token: string;
}
export interface CreateQuestionBatch {
  idempotency_key: string;
  selection: QuestionBatchSelection;
  preview_token: string;
}
export interface QuestionBatch {
  id: string;
  created_by: string;
  preview: QuestionBatchPreview;
  state: "running" | "completed" | "cancelled";
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  insufficient_candidates: number;
  cancelled: number;
  created_at: string;
}
export interface QuestionBatchPage {
  items: QuestionBatch[];
  pagination: CoinEntryPage["pagination"];
}

/** Lightweight, server-filtered administrative workbench reads. */
export interface QuestionWorkbenchQuery extends QuestionBankQuery {
  query?: string;
  question_level?: string;
  answer_profile?: string;
}
export interface QuestionWorkbenchItem {
  id: string;
  revision: number;
  state: BankQuestionState;
  created_by: string;
  spelling: string;
  part_of_speech: string;
  definition: string;
  prompt: string;
  question_level: string;
  answer_profile: string;
  options: { option_id: string; spelling: string }[];
  correct_option_id: string;
  source_current: boolean;
  has_concerns: boolean;
  updated_at: string;
}
export interface QuestionStateCounts {
  draft: number;
  approved: number;
  rejected: number;
  disabled: number;
}
export interface QuestionWorkbenchPage {
  items: QuestionWorkbenchItem[];
  pagination: CoinEntryPage["pagination"];
  counts: QuestionStateCounts;
}
export interface QuestionSemanticReview {
  verdict: "no_obvious_issue" | "needs_revision";
  issues: string[];
}
export interface QuestionInspection {
  question: BankQuestion;
  sources: { option_id: string; current: boolean }[];
  target_current: boolean;
  semantic_review: QuestionSemanticReview | null;
  semantic_review_current: boolean;
}
export interface SearchQuestionCandidates {
  entry_id?: string;
  query?: string;
  question_level: string;
  answer_profile: string;
  page?: number;
  page_size?: number;
  part_of_speech?: string;
  exclude_entry_ids?: string[];
  exclude_spellings?: string[];
  excluded_definition?: string;
  target_spelling?: string;
  editable_only?: boolean;
}
