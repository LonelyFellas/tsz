import type { RichTextV3 } from "./admin-word-v3";
import type { CoinEntryPage } from "./coins";
export type WordlistState =
  "draft" | "pending" | "published" | "rejected" | "withdrawn";
export interface Wordlist {
  id: string;
  owner_user_id: string;
  owner_name: string;
  name: string;
  state: WordlistState;
  revision: number;
  item_count: number;
  created_at: string;
  updated_at: string;
}
export interface WordlistPage {
  items: Wordlist[];
  pagination: CoinEntryPage["pagination"];
}
export interface WordlistQuery {
  q?: string;
  page?: number;
  page_size?: number;
}
export interface CreateWordlist {
  idempotency_key: string;
  name: string;
  items: { entry_id: string; private_note: string }[];
}
export interface WordlistNoteUpdate {
  entry_id: string;
  expected_note_revision: number;
  private_note: string;
}
export interface UpdateWordlist {
  expected_revision: number;
  content: {
    name: string;
    entry_ids: string[];
  } | null;
  note_updates: WordlistNoteUpdate[];
}
export interface WordlistEditSnapshot {
  wordlist: Wordlist;
  entry_ids: string[];
}
export interface WordlistText {
  dialect: "common" | "uk" | "us";
  content: RichTextV3;
}
export interface WordlistDefinition {
  id: string;
  definition_mode: string;
  level: string;
  grammar_structure_id: string | null;
  texts: WordlistText[];
}
export interface WordlistSense {
  id: string;
  sub_pos: string;
  level: string;
  definitions: WordlistDefinition[];
}
export interface WordlistGrammar {
  id: string;
  variants: WordlistText[];
}
export interface WordlistPos {
  pos_id: string;
  pos: string;
  senses: WordlistSense[];
  grammar_structures: WordlistGrammar[];
}
export interface WordlistEntry {
  entry_id: string;
  publication_id: string;
  label: string;
  kind: "word" | "phrase";
  pos: WordlistPos[];
}
export interface WordlistItem {
  entry_id: string;
  position: number;
  entry: WordlistEntry | null;
}
export interface MyWordlistItem extends WordlistItem {
  private_note: string;
  note_revision: number;
}
export interface WordlistItems {
  items: WordlistItem[];
  revision: number;
  pagination: CoinEntryPage["pagination"];
}
export interface MyWordlistItems {
  items: MyWordlistItem[];
  revision: number;
  pagination: CoinEntryPage["pagination"];
}
export interface WordlistCandidate {
  entry_id: string;
  publication_id: string;
  label: string;
  glosses: string[];
}
export interface WordlistCatalog {
  items: WordlistCandidate[];
  pagination: CoinEntryPage["pagination"];
}
export interface SubmitWordlist {
  expected_revision: number;
  idempotency_key: string;
}
export interface WordlistReview {
  id: string;
  wordlist_id: string;
  submitted_revision: number;
  name: string;
  state: string;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
}
export interface WordlistReviews {
  withdraw_reason: string | null;
  items: WordlistReview[];
}
export interface WordlistDecision {
  expected_revision: number;
  approve: boolean;
  reason: string | null;
}
export interface CreateWordlistTip {
  event_id: string;
  idempotency_key: string;
  amount: string;
}
export interface WordlistTip {
  event_id: string;
  wordlist_id: string;
  payer_user_id: string;
  author_user_id: string;
  amount: string;
  operation_id: string;
  created_at: string;
}
export interface WordlistTipRecord extends WordlistTip {
  wordlist_name: string | null;
  wordlist_accessible: boolean;
  counterparty_name: string | null;
}
export interface WordlistTipPage {
  items: WordlistTipRecord[];
  pagination: CoinEntryPage["pagination"];
}
