export interface LoginRewardDay {
  business_day: string;
  server_time: string;
  next_day_starts_at: string;
  status: "awarded" | "wallet_unavailable" | "reward_disabled";
  awarded_amount: string;
  operation_id: string | null;
}
