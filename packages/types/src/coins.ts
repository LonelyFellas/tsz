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
