// 平台后台（admin）账号体系的 wire 类型 —— 1:1 镜像后端 openapi 的
// `Admin (auth/accounts)` 标签 schema，字段一律 snake_case。
//
// admin 是与 web 学员/教师**完全独立**的身份体系：独立登录 / 独立 token /
// 独立 refresh cookie（path=/api/v1/admin）。这些类型此前散落在 @tsz/api-client，
// 现统一收敛到 @tsz/types（wire 类型的唯一家），api-client / shared 均镜像本文件。

/** admin 权限等级：super_admin 额外可管理管理员账号。 */
export type AdminLevel = "admin" | "super_admin";

/**
 * 后台侧栏菜单权限 key —— 每个可委派菜单叶子一个，与后端 internal/authz 目录一一对应
 * （docs/admin-rbac-design.md）。普通管理员持有其角色被授予的子集；super_admin 隐式持有
 * 全部（后端在 profile 里直接下发整份目录）。「首页」无 key（恒显示）；「管理员管理」不走 key，
 * 仍按 level==super_admin 判定。
 */
export type MenuPermission =
  | "users.access"
  | "classes.access"
  | "words.access"
  | "customdict.access"
  | "sentences.access"
  | "wordlists.access"
  | "customwordlist.access"
  | "tasks.access"
  | "reviews.access"
  | "teacherapply.access"
  | "comments.access"
  | "coins.access";

/** admin 账号状态。disabled 的账号无法登录 / 刷新。 */
export type AdminStatus = "active" | "disabled";

/** 后台列表分页信封（admin 所有列表通用）：?page=&page_size= → { page, page_size, total }。 */
export interface PageMeta {
  page: number;
  page_size: number;
  /** 匹配总行数（跨所有页）。 */
  total: number;
}

/** GET /admin/profile 的响应：登录管理员自身身份，用于门禁探针 + 顶栏「已登录为 X」+ 动态菜单。 */
export interface AdminProfile {
  id: string;
  phone: string;
  display_name: string;
  level: AdminLevel;
  /**
   * 本管理员持有的菜单权限 key（RBAC）。前端据此决定侧栏各叶子是否渲染；super_admin 会拿到
   * 整份可委派目录。恒为数组（可空数组表示无任何可委派菜单）。
   */
  permissions: MenuPermission[];
}

/** 账号管理里看到的完整 admin 对象（含状态与创建时间）。 */
export interface Admin {
  id: string;
  phone: string;
  /** 未设置时省略。 */
  email?: string;
  display_name: string;
  level: AdminLevel;
  status: AdminStatus;
  /** ISO8601 */
  created_at: string;
}

/** POST /admin/auth/login 的响应。refresh token 不在 body（在 admin_refresh_token cookie）。 */
export interface AdminAuthResponse {
  admin: Admin;
  access_token: string;
  level: AdminLevel;
  /** access token 剩余有效期（秒），约 900。 */
  expires_in: number;
  /** refresh token 过期的 Unix 时间戳（秒）。 */
  refresh_token_expires_at: number;
  /**
   * true = 该账号刚被重置密码，必须先改密：其余 admin 接口在改密前一律 403
   * `must_change_password`（仅 change-password / logout 可达）。前端须路由到改密流程。
   */
  must_change_password: boolean;
}

/**
 * POST /admin/admins 请求体（超管建号）。对齐 openapi CreateAdminRequest。
 * 密码由后端生成（响应里一次性返回，见 CreateAdminResponse），等级恒为 admin
 * （不能经此接口建超管），故请求体**不含** password / level——传了也会被后端忽略。
 */
export interface CreateAdminInput {
  /** 5–20 位。 */
  phone: string;
  /** 1–50 字符；服务端 trim；含 < > 或控制/不可见字符 → 400。 */
  display_name: string;
  /** 可选。 */
  email?: string;
}

/**
 * POST /admin/admins 的 201 响应：新账号 + 一次性临时密码。
 * temporary_password 为后端生成的明文，仅此一次返回（不存储、不记日志），
 * 新账号带 must_change_password，对方用它首登后被强制改密。
 */
export interface CreateAdminResponse {
  admin: Admin;
  temporary_password: string;
}

/** GET /admin/admins 查询参数（可按 level / 关键字过滤 + 分页）。 */
export interface AdminListQuery {
  level?: AdminLevel;
  /** 手机 / 邮箱 / 昵称的自由文本匹配。 */
  q?: string;
  page?: number;
  page_size?: number;
}

/** GET /admin/admins 的响应。 */
export interface AdminListResponse {
  items: Admin[];
  page: PageMeta;
}

/** PATCH /admin/admins/{id}/status 请求体。 */
export interface AdminStatusInput {
  status: AdminStatus;
}

/** POST /admin/admins/{id}/reset-password 的响应：一次性明文临时密码（仅此一次返回）。 */
export interface ResetPasswordResponse {
  temporary_password: string;
}

/**
 * POST /admin/auth/change-password 请求体：登录管理员改自己的密码。
 * 既服务超管重置后的首次强制改密，也服务日常自助改密。对齐 openapi AdminChangePasswordRequest。
 */
export interface AdminChangePasswordInput {
  /** 当前密码（重置后即为一次性临时密码）。 */
  current_password: string;
  /** 新密码：≥12 位、非纯数字、非弱密码、不含手机号，且须与当前密码不同。违反 → 400。 */
  new_password: string;
}
