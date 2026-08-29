import type {
  AdminWordKind,
  AdminWordStatus,
  CefrLevel,
  WordPosTag
} from "@tsz/types";
import dayjs, { type Dayjs } from "dayjs";
import { CEFR_LEVELS } from "./labels";
import type { WordFilterValues } from "./listQuery";

const KINDS = new Set<AdminWordKind>(["word", "phrase"]);
const STATUSES = new Set<AdminWordStatus>(["draft", "published", "archived"]);
const LEVELS = new Set<CefrLevel>(CEFR_LEVELS);
const POS_CODE = /^[a-z][a-z0-9_]{0,31}$/u;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZES = new Set([10, 20, 50, 100]);

export interface WordListSearchParams {
  filters: WordFilterValues;
  page: number;
  pageSize: number;
}

function trimmed(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function dateParam(value: string | null): Dayjs | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = dayjs(value);
  return parsed.isValid() && parsed.format("YYYY-MM-DD") === value
    ? parsed
    : null;
}

export function parseWordFilterSearchParams(
  params: URLSearchParams
): WordFilterValues {
  const keyword = trimmed(params.get("keyword"));
  const gloss = trimmed(params.get("gloss"));
  const kind = params.get("kind");
  const pos = params.get("pos");
  const level = params.get("level");
  const status = params.get("status");
  const createdFrom = dateParam(params.get("created_from"));
  const createdTo = dateParam(params.get("created_to"));
  return {
    ...(keyword ? { keyword } : {}),
    ...(gloss ? { gloss } : {}),
    ...(kind && KINDS.has(kind as AdminWordKind)
      ? { kind: kind as AdminWordKind }
      : {}),
    ...(pos && POS_CODE.test(pos) ? { pos: pos as WordPosTag } : {}),
    ...(level && LEVELS.has(level as CefrLevel)
      ? { level: level as CefrLevel }
      : {}),
    ...(status && STATUSES.has(status as AdminWordStatus)
      ? { status: status as AdminWordStatus }
      : {}),
    ...(createdFrom || createdTo
      ? { range: [createdFrom, createdTo] as [Dayjs | null, Dayjs | null] }
      : {})
  };
}

export function serializeWordFilterSearchParams(
  values: WordFilterValues
): URLSearchParams {
  const params = new URLSearchParams();
  const keyword = values.keyword?.trim();
  const gloss = values.gloss?.trim();
  if (keyword) params.set("keyword", keyword);
  if (gloss) params.set("gloss", gloss);
  if (values.kind) params.set("kind", values.kind);
  if (values.pos) params.set("pos", values.pos);
  if (values.level) params.set("level", values.level);
  if (values.status) params.set("status", values.status);
  if (values.range?.[0]) {
    params.set("created_from", values.range[0].format("YYYY-MM-DD"));
  }
  if (values.range?.[1]) {
    params.set("created_to", values.range[1].format("YYYY-MM-DD"));
  }
  return params;
}

function positiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseWordListSearchParams(
  params: URLSearchParams
): WordListSearchParams {
  const page = positiveInteger(params.get("page")) ?? DEFAULT_PAGE;
  const requestedPageSize = positiveInteger(params.get("page_size"));
  return {
    filters: parseWordFilterSearchParams(params),
    page,
    pageSize:
      requestedPageSize && PAGE_SIZES.has(requestedPageSize)
        ? requestedPageSize
        : DEFAULT_PAGE_SIZE
  };
}

export function serializeWordListSearchParams(
  filters: WordFilterValues,
  page: number,
  pageSize: number
): URLSearchParams {
  const params = serializeWordFilterSearchParams(filters);
  if (page > DEFAULT_PAGE) params.set("page", String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("page_size", String(pageSize));
  }
  return params;
}
