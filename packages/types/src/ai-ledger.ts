/** 超管 AI 账本；nullable 表示未取得观测，不能视为零。 */
export interface AiCallMetrics {
  phase: "generate" | "review";
  outcome: "response" | "error" | "cancelled";
  duration_ms: number;
  cache_hit_tokens: number | null;
  cache_miss_tokens: number | null;
}
export interface AiLedgerItem {
  call_id: string;
  run_id: string;
  external_request_id: string;
  model: string;
  created_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost: string | null;
  metrics: AiCallMetrics | null;
}
export interface AiLedgerSummary {
  observed_calls: number;
  usage_observed_calls: number;
  cache_observed_calls: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_hit_tokens: number | null;
  cache_miss_tokens: number | null;
  cache_hit_rate: number | null;
  total_duration_ms: number | null;
  average_duration_ms: number | null;
}
export interface AiLedgerPage {
  items: AiLedgerItem[];
  total: number;
  page: number;
  page_size: number;
  summary: AiLedgerSummary;
}
export interface AiLedgerQuery {
  page?: number;
  page_size?: number;
  run_id?: string;
}
