// 列表页搜索行 → GET /admin/words 查询参数的纯映射(可单测)。
import type {
  AdminWordKind,
  AdminWordListQuery,
  AdminWordStatus,
  CefrLevel,
  WordPosTag
} from "@tsz/types";
import type { Dayjs } from "dayjs";

/** 搜索行表单值(antd Form 收集,camelCase 属前端本地 state)。 */
export interface WordFilterValues {
  keyword?: string;
  gloss?: string;
  kind?: AdminWordKind;
  pos?: WordPosTag;
  level?: CefrLevel;
  status?: AdminWordStatus;
  range?: [Dayjs | null, Dayjs | null] | null;
}

/**
 * 组装列表查询:空值不带参;创建时间映射为 RFC3339 半开区间 [from, to) ——
 * to 取所选结束日的次日零点,才能包含结束日全天。
 */
export function toListQuery(
  filters: WordFilterValues,
  page: number,
  pageSize: number
): AdminWordListQuery {
  const { keyword, gloss, kind, pos, level, status, range } = filters;
  const query: AdminWordListQuery = { page, page_size: pageSize };
  const q = keyword?.trim();
  if (q) query.q = q;
  const g = gloss?.trim();
  if (g) query.gloss = g;
  if (kind) query.kind = kind;
  if (pos) query.pos = pos;
  if (level) query.level = level;
  if (status) query.status = status;
  if (range?.[0]) query.created_from = range[0].startOf("day").toISOString();
  if (range?.[1]) {
    query.created_to = range[1].add(1, "day").startOf("day").toISOString();
  }
  return query;
}
