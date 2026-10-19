export interface LearningRewardDay {
  business_day: string;
  server_time: string;
  rule_version: string | null;
  minimum_units: number | null;
  daily_amount: string | null;
  qualifying_units: number;
  status:
    | "in_progress"
    | "threshold_not_met"
    | "awarded"
    | "reward_disabled"
    | "wallet_unavailable";
  awarded_amount: string;
  operation_id: string | null;
  settled_at: string | null;
}
