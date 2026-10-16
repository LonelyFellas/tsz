import type { RichTextV3 } from "./admin-word-v3";
import type { CoinEntryPage } from "./coins";
export type WordlistState =
  "draft" | "pending" | "published" | "rejected" | "withdrawn";
export interface Wordlist {
  id: string;
  owner_user_id: string | null;
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
export type WordlistView = "standard" | "full";
export type WordlistSort = "author" | "label_asc" | "label_desc";
export interface WordlistItemsQuery extends WordlistQuery {
  view?: WordlistView;
  sort?: WordlistSort;
}
export interface CreateWordlist {
  folder_id?: string;
  idempotency_key: string;
  name: string;
  items: { entry_id: string; private_note: string; author_note?: string }[];
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
    author_notes?: { entry_id: string; author_note: string }[] | null;
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
  sub_pos_label?: string;
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
  label?: string;
  forms?: WordlistForm[];
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
  author_note?: string;
  entry: WordlistEntry | null;
}
export type WordlistUnavailableReason =
  "archived" | "unpublished" | "unsupported_schema";
export interface MyWordlistItem extends WordlistItem {
  unavailable_reason?: WordlistUnavailableReason;
  entry_label?: string;
  private_note: string;
  note_revision: number;
}
export interface WordlistAvailability {
  revision: number;
  available_count: number;
  unavailable_count: number;
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
export interface AdminWordlistReview extends WordlistReview {
  reviewer_id?: string | null;
  reviewer_name?: string | null;
}
export interface AdminWordlistReviews {
  withdraw_reason: string | null;
  items: AdminWordlistReview[];
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

export interface WordlistPronunciation {
  id: string;
  dict_phonetic: string;
  dict_phonetic_rich?: RichTextV3;
}
export interface WordlistFormVariant {
  id: string;
  dialect: "common" | "uk" | "us";
  spelling: string;
  pronunciations: WordlistPronunciation[];
}
export interface WordlistForm {
  id: string;
  form_type: string;
  label: string;
  sense_ids: string[];
  variants: WordlistFormVariant[];
}

export interface AdminWordlist {
  wordlist: Wordlist;
  review_state: "none" | "pending" | "approved" | "rejected";
  recommended: boolean;
  tip_amount: string;
}
export interface AdminWordlistPage {
  items: AdminWordlist[];
  pagination: WordlistPage["pagination"];
}
export interface WordlistManagementQuery extends WordlistQuery {
  review_state?: AdminWordlist["review_state"];
  public?: boolean;
  recommended?: boolean;
  created_from?: string;
  created_before?: string;
}
export interface WordlistSuggestionQuery {
  q: string;
}
export interface WordlistSuggestions {
  items: WordlistCandidate[];
}

export interface WordlistImportMatchRequest {
  words: string[];
}
export interface WordlistImportMatch {
  status: "matched" | "ambiguous" | "unmatched";
  candidates: WordlistCandidate[];
}
export interface WordlistImportMatches {
  items: WordlistImportMatch[];
}

export interface WordlistInteractionStats {
  wordlist_id: string;
  like_count: number;
  favorite_count: number;
  tip_amount: string;
}
export interface WordlistInteractionStatsBatch {
  items: WordlistInteractionStats[];
}
export interface WordlistInteractionState {
  wordlist_id: string;
  liked: boolean;
  favorited: boolean;
}
export interface WordlistInteractionStates {
  items: WordlistInteractionState[];
}
export interface SetWordlistInteraction {
  folder_id?: string;
  kind: "like" | "favorite";
  active: boolean;
}
export interface WordlistFavorite {
  wordlist_id: string;
  wordlist: Wordlist | null;
}
export interface WordlistFavoritePage {
  items: WordlistFavorite[];
  pagination: WordlistPage["pagination"];
}
