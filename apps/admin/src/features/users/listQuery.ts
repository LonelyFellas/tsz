// 用户管理搜索行 → 查询参数的纯映射（可单测）。
// 本地表单值用 camelCase；映射到后端 wire（snake_case）的 AdminUserListQuery。
import type { AdminUserListQuery } from "@tsz/types";
import type { Dayjs } from "dayjs";

/** 角色 tab 选项（映射后端 role 参数：all=不传）。 */
export type UserRoleTab = "all" | "student" | "teacher";

/** 搜索行表单值（antd Form 收集，camelCase 属前端本地 state）。 */
export interface UserFilterValues {
  /** 用户昵称。 */
  nickname?: string;
  /** 绑定手机号。 */
  phone?: string;
  /** 绑定邮箱。 */
  email?: string;
  /**
   * 注册日期（单日）。后端 GET /admin/users 当前无时间筛选参数，
   * 故不进 wire query，由 mock 层客户端过滤。
   * TODO(backend): 见 docs/features/admin-user-management/backend-todos.md #2。
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
 * - q: 后端是单一自由文本（匹配手机/邮箱/昵称），故把已填的昵称/手机/邮箱以空格拼接为一个 q。
 *   （精确的分字段过滤当前只在 mock 层实现；真实后端需 q 支持，见 backend-todos #2 说明。）
 * - registeredDate 不进 wire（后端无参数）。
 */
export function toUserListQuery(params: UserListParams): AdminUserListQuery {
  const { filters, role, page, pageSize } = params;
  const q = [filters.nickname, filters.phone, filters.email]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v)
    .join(" ");

  const query: AdminUserListQuery = { page, page_size: pageSize };
  if (role !== "all") query.role = role;
  if (q) query.q = q;
  return query;
}
