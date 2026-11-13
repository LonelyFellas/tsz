// 列表页搜索行 → GET /admin/lexicon/entries 查询参数的纯映射(可单测)。
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
  targetLanguage?: string;
  mediumLocale?: string;
  /** 兼容旧 URL 的词面/创建人混合搜索。 */
  keyword?: string;
  headword?: string;
  createdBy?: string;
  gloss?: string;
  kind?: AdminWordKind;
  pos?: WordPosTag;
  level?: CefrLevel;
  status?: AdminWordStatus;
  range?: [Dayjs | null, Dayjs | null] | null;
  /** 首页统计深链的日历口径；普通手动筛选仍使用浏览器时区。 */
  rangeTimezone?: "Asia/Shanghai";
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
  const {
    keyword,
    headword,
    createdBy,
    gloss,
    kind,
    pos,
    level,
    status,
    range,
    rangeTimezone
  } = filters;
  const query: AdminWordListQuery = { page, page_size: pageSize };
  const q = keyword?.trim();
  if (q) query.q = q;
  const word = headword?.trim();
  if (word) query.headword = word;
  if (createdBy) query.created_by = createdBy;
  const g = gloss?.trim();
  if (g) query.gloss = g;
  if (kind) query.kind = kind;
  if (pos) query.pos = pos;
  if (level) query.level = level;
  if (status) query.status = status;
  const midnight = (date: Dayjs) =>
    rangeTimezone === "Asia/Shanghai"
      ? new Date(`${date.format("YYYY-MM-DD")}T00:00:00+08:00`).toISOString()
      : date.startOf("day").toISOString();
  if (range?.[0]) query.created_from = midnight(range[0]);
  if (range?.[1]) query.created_to = midnight(range[1].add(1, "day"));
  return query;
}
