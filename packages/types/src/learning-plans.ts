import type {
  LearningTaskType,
  LearningQuestionType,
  LearningTask,
  LearningRun,
  LearningPreview,
  LearningPageQuery,
  LearningTaskDetail
} from "./learning-tasks";
import type { CoinEntryPage } from "./coins";
export interface LearningSchedule {
  start_date: string;
  end_date: string;
}
export interface PreviewLearningPlan {
  question_type?: LearningQuestionType;
  task_type: LearningTaskType;
  wordlist_ids: string[];
  daily_question_count: number | null;
  schedule: LearningSchedule | null;
}
export interface CreateLearningPlan extends PreviewLearningPlan {
  idempotency_key: string;
  name: string;
  preview_fingerprint: string;
}
export interface LearningPlanPreview extends Omit<
  LearningPreview,
  "can_start"
> {
  custom_word_count: number;
  estimated_learning_days: number | null;
  available_learning_days: number | null;
  can_create: boolean;
  reasons: string[];
  preview_fingerprint: string;
  server_time: string;
  business_day: string;
  timezone: string;
}
export type CycleOperation = "next" | "restart_blocked";
export interface PreviewLearningCycle {
  operation: CycleOperation;
  after_cycle_id: string;
  expected_revision: number;
}
export interface CreateLearningCycle extends PreviewLearningCycle {
  preview_fingerprint: string;
  idempotency_key: string;
}
export interface LearningCyclePreview {
  preview: LearningPlanPreview;
  earliest_day: string;
  previous_covered_count: number;
  previous_total_count: number;
  previous_blocked_count: number;
}
export interface LearningCycle {
  id: string;
  cycle_number: number;
  state: "active" | "completed" | "cancelled";
  total_count: number;
  covered_count: number;
  remaining_count: number;
  available_remaining_count: number;
  blocked_count: number;
  earliest_day: string;
  created_at: string;
  completed_at: string | null;
}
export interface LearningPlanSource {
  id: string;
  available: boolean;
  name: string | null;
  personal_note: string | null;
  author_name: string | null;
  state: string | null;
  item_count: number | null;
}
export interface LearningPlan extends Omit<LearningTaskDetail, "task"> {
  task: LearningTask;
  mode: "legacy_v1" | "coverage_v1";
  schedule: LearningSchedule | null;
  sources: LearningPlanSource[];
  current_cycle: LearningCycle | null;
  today_available_count: number;
  estimated_learning_days: number | null;
  estimate_from_day: string | null;
  schedule_at_risk: boolean;
  status:
    | "archived"
    | "schedule_ended"
    | "cycle_completed"
    | "not_started"
    | "today_completed"
    | "source_blocked"
    | "ready";
  can_start: boolean;
  can_start_next_cycle: boolean;
  can_restart_blocked_cycle: boolean;
  reasons: string[];
  next_day_at: string;
}
export interface LearningPlanPage {
  items: LearningPlan[];
  pagination: CoinEntryPage["pagination"];
}
export interface LearningCyclePage {
  items: LearningCycle[];
  pagination: CoinEntryPage["pagination"];
}
export interface LearningPlanRun {
  run: LearningRun;
  cycle_id: string | null;
}
export interface LearningPlanRunPage {
  items: LearningPlanRun[];
  pagination: CoinEntryPage["pagination"];
}
export type LearningPlanPageQuery = LearningPageQuery;
