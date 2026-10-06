/** Decimal strings preserve the full PostgreSQL BIGINT range. */
export type CoinOwnerType = "user" | "admin";
export type CoinWalletStatus = "open" | "deletion_pending" | "closed";
export type CoinOperationKind =
  "credit" | "debit" | "transfer" | "account_closure_forfeit";
export interface CoinWallet {
  owner_type: CoinOwnerType;
  owner_id: string;
  balance: string;
  status: CoinWalletStatus;
}
export interface CoinEntry {
  id: string;
  operation_id: string;
  kind: CoinOperationKind;
  source_type: string;
  delta: string;
  balance_after: string;
  created_at: string;
}
export interface CoinEntryPage {
  items: CoinEntry[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
  snapshot: string;
}
export interface CoinEntriesQuery {
  page?: number;
  page_size?: number;
  snapshot?: string;
}

export interface ManualCreditRequest {
  owner_type: CoinOwnerType;
  owner_id: string;
  amount: string;
  category: "purchase" | "reward";
  event_id: string;
  reason: string;
  evidence_ref?: string | null;
  idempotency_key: string;
}
export interface ManualReversalRequest {
  idempotency_key: string;
  reason: string;
}
export interface CoinAccount extends CoinWallet {
  display_name: string;
  account_status: string;
}
export interface CoinAccountPage {
  items: CoinAccount[];
  pagination: CoinEntryPage["pagination"];
}
export interface CoinAccountsQuery {
  owner_type: CoinOwnerType;
  search: string;
  page?: number;
  page_size?: number;
}
export interface ManualCoinOperation {
  id: string;
  owner_type: CoinOwnerType;
  owner_id: string;
  actor_id: string;
  source_type: string;
  event_id: string;
  delta: string;
  balance_after: string;
  reason: string;
  evidence_ref?: string | null;
  reverses_operation_id?: string | null;
  reversed_by_operation_id?: string | null;
  created_at: string;
}
export interface ManualCoinOperationPage {
  items: ManualCoinOperation[];
  pagination: CoinEntryPage["pagination"];
}
export interface CoinOperationsQuery {
  owner_type?: CoinOwnerType;
  owner_id?: string;
  actor_id?: string;
  source_type?: "manual_purchase" | "manual_reward" | "manual_reversal";
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
}
