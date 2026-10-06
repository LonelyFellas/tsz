import type { CoinEntryPage } from "./coins";
export interface InvitationOverview {
  invite_code: string | null;
  reward_amount: string | null;
  can_receive_reward: boolean;
}
export interface InvitationCode {
  invite_code: string;
}
export type InvitationRewardStatus =
  "awarded" | "reward_disabled" | "inviter_unavailable";
export interface InvitationRecord {
  invitee_user_id: string;
  invitee_name: string | null;
  reward_status: InvitationRewardStatus;
  reward_amount: string;
  created_at: string;
}
export interface InvitationRecordPage {
  items: InvitationRecord[];
  pagination: CoinEntryPage["pagination"];
}
export interface InvitationRecordsQuery {
  page?: number;
  page_size?: number;
}
