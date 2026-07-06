// 后台「用户管理」里看到的 C 端用户（web 学员/教师）—— 1:1 镜像 openapi `AdminUser`。
// 与 web 的 User 同源，但后台视图里联系方式（手机/邮箱）与状态始终可见（不脱敏）。
import type { Role } from "./user";
import type { PageMeta } from "./admin";

/**
 * GET /admin/users 列表项。required: id, display_name, roles, status, created_at；
 * phone / email / coin_balance 可选（邮箱账号无手机，反之亦然；余额由账本派生）。
 */
export interface AdminUser {
  id: string;
  /** 无手机的邮箱账号省略。 */
  phone?: string;
  /** 未设置时省略。 */
  email?: string;
  display_name: string;
  /** 师生合一：一个账号可同时持有 student / teacher。 */
  roles: Role[];
  status: "active" | "disabled";
  /** 当前天生币余额（账本派生）。 */
  coin_balance?: number;
  /** ISO8601 注册时间。 */
  created_at: string;
}

/** GET /admin/users 查询参数（按持有角色 / 关键字过滤 + 分页）。 */
export interface AdminUserListQuery {
  /** 按持有角色过滤；不传 = 全部。 */
  role?: "student" | "teacher";
  /** 手机 / 邮箱 / 昵称的自由文本匹配。 */
  q?: string;
  page?: number;
  page_size?: number;
}

/** GET /admin/users 的响应。 */
export interface AdminUserListResponse {
  items: AdminUser[];
  page: PageMeta;
}

/**
 * 前端页面渲染视图（**非 wire**，仅本地）：在 AdminUser 之上补产品原型要展示、
 * 但当前 `AdminUser` 契约尚未提供的字段。这些字段目前由 mock 层填充。
 *
 * TODO(backend): 见 docs/features/admin-user-management/backend-todos.md #1 —
 * 待后端把 avatar_url / level / updated_at 补进 AdminUser 后，删除本视图、直接用 AdminUser。
 */
export interface AdminUserView extends AdminUser {
  /** 头像绝对地址；未设置为 ""。TODO(backend) #1。 */
  avatar_url?: string;
  /** 语言等级（A1/A2…；教师取其作为学生时的等级，口径待产品确认）。TODO(backend) #1。 */
  level?: string;
  /** ISO8601 更新时间。TODO(backend) #1。 */
  updated_at?: string;
}
