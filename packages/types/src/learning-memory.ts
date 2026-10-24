import type { LearningContext, LearningQuestion } from "./learning-tasks";
type LearningPrompt = NonNullable<LearningQuestion["prompt"]>;

export interface MemoryOverview {
  available: boolean;
  enabled: boolean;
  answer_profile: string;
  due_count: number;
  relearning_count: number;
  later_count: number;
  paused_count: number;
  unavailable_count: number;
  server_time: string;
  next_day_at: string;
  current_session_id: string | null;
}
export interface MemoryItem {
  id: string;
  label: string | null;
  stage: string;
  due_at: string;
  paused: boolean;
  content_available: boolean;
  revision: number;
}
export interface MemoryPage {
  items: MemoryItem[];
  next_cursor: string | null;
  server_time: string;
}
export interface StartReview {
  idempotency_key: string;
  mode: "due" | "retest";
  limit: number | null;
}
export interface ReviewAnswerInput {
  idempotency_key: string;
  item_id: string;
  answer: string;
}
export interface ReviewFeedback {
  answer_id: string;
  is_correct: boolean;
  submitted_answer: string;
  accepted_answers: string[];
  memory_effect: string;
  accepted_at: string;
}
export interface ReviewItem {
  id: string;
  memory_id: string;
  kind: string;
  answered: boolean;
  content_available: boolean;
  revealed: boolean;
  prompt: LearningPrompt | null;
  revealed_answers: string[] | null;
  feedback: ReviewFeedback | null;
  expires_at: string;
}
export interface ReviewSession {
  id: string;
  state: string;
  settings: LearningContext;
  items: ReviewItem[];
  target_count: number;
  answered_count: number;
  server_time: string;
  expires_at: string;
}
export interface ReviewReceipt {
  answer_id: string;
  item_id: string;
  is_correct: boolean;
  memory_effect: string;
  next_due_at: string;
  accepted_at: string;
  session: ReviewSession;
}
