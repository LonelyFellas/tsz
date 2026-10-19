import type { CoinEntryPage } from "./coins";
type PaginationMeta = CoinEntryPage["pagination"];
export type LearningTaskType = "daily" | "longterm";
export type LearningTaskState = "active" | "archived";
export type LearningRunState =
  "active" | "completed" | "expired" | "invalidated" | "cancelled";
export interface LearningContext {
  cefr_level: string;
  english_variant: string;
}
export interface PreviewLearningTask {
  task_type: LearningTaskType;
  wordlist_ids: string[];
  daily_question_count: number | null;
  ends_at: string | null;
}
export interface CreateLearningTask extends PreviewLearningTask {
  idempotency_key: string;
  name: string;
}
export interface StartLearningRun {
  idempotency_key: string;
  expected_revision: number;
  after_run_id: string | null;
}
export interface SubmitLearningAnswer {
  idempotency_key: string;
  question_id: string;
  answer: string;
}
export interface LearningTask extends PreviewLearningTask {
  id: string;
  name: string;
  state: LearningTaskState;
  revision: number;
  created_at: string;
}
export interface LearningRun {
  id: string;
  task_id: string;
  task_type: LearningTaskType;
  state: LearningRunState;
  question_type: string;
  task_revision: number;
  business_day: string | null;
  expires_at: string | null;
  started_at: string;
  server_time: string;
  settings: LearningContext;
  target_count: number;
  answered_count: number;
  correct_count: number;
  generation_version: string;
  grading_version: string;
  completion_id: string | null;
}
export interface LearningTaskDetail {
  task: LearningTask;
  server_time: string;
  business_day: string;
  timezone: string;
  current_run: LearningRun | null;
}
export interface LearningTaskPage {
  items: LearningTaskDetail[];
  pagination: PaginationMeta;
}
export interface LearningRunPage {
  items: LearningRun[];
  pagination: PaginationMeta;
}
export interface LearningPreview {
  eligible_count: number;
  entry_count: number;
  exclusions: {
    unavailable_entries: number;
    context_dependent: number;
    no_chinese_definition: number;
    no_base_form: number;
    answer_in_prompt: number;
  };
  settings: LearningContext;
  can_start: boolean;
}
export interface LearningQuestion {
  id: string;
  position: number;
  answered: boolean;
  content_available: boolean;
  prompt: { definition: string; part_of_speech: string } | null;
  feedback: {
    answer_id: string;
    submitted_answer: string;
    is_correct: boolean;
    accepted_at: string;
    accepted_answers: string[];
  } | null;
}
export interface LearningQuestionPage {
  items: LearningQuestion[];
  pagination: PaginationMeta;
}
export interface LearningAnswerReceipt {
  answer_id: string;
  question_id: string;
  is_correct: boolean;
  accepted_at: string;
  run: LearningRun;
  question: LearningQuestion;
}
export interface LearningPageQuery {
  page?: number;
  page_size?: number;
  state?: LearningTaskState;
}
