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

export interface AiModelPricing {
  version: string;
  model: string;
  currency: "CNY";
  tariff: "peak" | "off_peak";
  quoted_at: string;
  input_hit_per_million: string;
  input_miss_per_million: string;
  output_per_million: string;
}
export interface AiCallCost {
  call_id: string;
  estimated_cost_cny: string | null;
  pricing: AiModelPricing | null;
}
export interface AiCostTotals {
  estimated_cost_cny: string | null;
  total_calls: number;
  priced_calls: number;
  unknown_calls: number;
}
export interface AiCostPeriod extends AiCostTotals {
  start: string | null;
  end: string;
}
export interface AiCostOverview {
  generated_at: string;
  timezone: "Asia/Shanghai";
  currency: "CNY";
  pricing_version: string;
  pricing_valid_until: string;
  total: AiCostPeriod;
  today: AiCostPeriod;
  week: AiCostPeriod;
  month: AiCostPeriod;
}
export interface AiCostLedgerPage {
  ledger: AiLedgerPage;
  costs: AiCallCost[];
  cost_summary: AiCostTotals;
}
