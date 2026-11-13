import type { AdminPaginationMeta } from "./admin";

export type LexiconTaxonomyKind = "registers" | "domains";

export interface LexiconTaxonomy {
  id: string;
  code: string;
  name_zh: string;
  name_en: string;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface LexiconTaxonomyListQuery {
  q?: string;
  page?: number;
  page_size?: number;
}

export interface LexiconTaxonomyListResponse {
  items: LexiconTaxonomy[];
  pagination: AdminPaginationMeta;
}

export interface CreateLexiconTaxonomyInput {
  code: string;
  name_zh: string;
  name_en: string;
  sort_order: number;
}

export interface UpdateLexiconTaxonomyInput {
  base_revision: number;
  name_zh: string;
  name_en: string;
  sort_order: number;
}
