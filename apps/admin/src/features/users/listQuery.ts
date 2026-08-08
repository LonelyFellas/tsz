// 用户管理搜索行 → 查询参数的纯映射（可单测）。
// 本地表单值用 camelCase；映射到后端 wire（snake_case）的 AdminUserListQuery。
import type { AdminUserListQuery } from "@tsz/types";
import type { Dayjs } from "dayjs";

/** 角色 tab 选项（映射后端 role 参数：all=不传）。 */
export type UserRoleTab = "all" | "student" | "teacher";

/** 搜索行表单值（antd Form 收集，camelCase 属前端本地 state）。 */
export interface UserFilterValues {
  /** 手机号、邮箱或昵称的单一字面子串关键词。 */
  q?: string;
  /**
   * 注册日期（单日）。映射为后端 registered_from / registered_to 半开区间
   * [当日 00:00, 次日 00:00)，即「注册于这一天」。
   */
  registeredDate?: Dayjs | null;
}

/** 列表查询的完整入参（筛选 + 角色 tab + 分页），mock 与真实数据源共用。 */
export interface UserListParams {
  filters: UserFilterValues;
  role: UserRoleTab;
  page: number;
  pageSize: number;
}

/**
 * 组装**发往后端**的列表查询：
 * - role: all → 不传；否则透传 student/teacher。
 * - q: 单一自由文本，对手机/邮箱/昵称做字面子串匹配。
 * - registeredDate（单日）→ registered_from = 当日 00:00、registered_to = 次日 00:00，
 *   即后端的半开区间 [from, to)「注册于这一天」。
 */
export function toUserListQuery(params: UserListParams): AdminUserListQuery {
  const { filters, role, page, pageSize } = params;
  const q = filters.q?.trim();

  const query: AdminUserListQuery = { page, page_size: pageSize };
  if (role !== "all") query.role = role;
  if (q) query.q = q;
  if (filters.registeredDate) {
    const from = filters.registeredDate.startOf("day");
    query.registered_from = from.toISOString();
    query.registered_to = from.add(1, "day").toISOString();
  }
  return query;
}
