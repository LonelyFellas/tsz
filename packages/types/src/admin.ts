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

/** tsz-rust 管理员列表返回的分页元数据。 */
export interface AdminPaginationMeta extends PageMeta {
  total_pages: number;
}

/**
 * 管理员的英语方言偏好（英美方言偏好化 A1）：账号级个人设置。
 * 它只决定 admin 端的录入与展示口径，**不是词条属性**——同一条词条的英美并列拼写
 * 由 headwords 承载，不因某个管理员偏好英式就消失。
 * **默认值只由后端持有**（从未设置过的管理员返回 `uk`），前端不再保留第二处默认。
 */
export type AdminDialectPreference = "uk" | "us";

/**
 * 管理员个人偏好。眼下只有方言一项，仍嵌一层对象：将来加第二项时
 * profile 响应的形状不用再变，前端也不必区分「顶层字段」与「偏好」。
 */
export interface AdminPreferences {
  dialect: AdminDialectPreference;
}

/** GET /admin/profile 的响应：登录管理员自身身份，用于门禁探针 + 顶栏「已登录为 X」+ 动态菜单。 */
export interface AdminProfile {
  id: string;
  phone: string;
  display_name: string;
  /** 身份等级——后端字段名统一为 role（Q11），值域同 AdminLevel。 */
  role: AdminLevel;
  /**
   * 菜单权限 key 目录。Q10 取消 RBAC 后为全量死数据（全员全功能），保留仅为菜单渲染
   * 零改动；恒为数组，顺序即侧栏顺序。「管理员管理」不走 key，按 role 判定。
   */
  permissions: MenuPermission[];
  /** 个人偏好；字段恒在，从未设置过的管理员返回后端默认值。 */
  preferences: AdminPreferences;
}

/** PATCH /admin/profile/preferences 的请求体。只带要改的偏好，改的恒是自己的。 */
export interface UpdateAdminPreferencesInput {
  dialect: AdminDialectPreference;
}

/** PATCH /admin/profile/preferences 的响应：落库后的完整偏好。 */
export interface UpdateAdminPreferencesResponse {
  preferences: AdminPreferences;
}

/** 账号管理里看到的完整 admin 对象（含状态与创建时间）。 */
export interface Admin {
  id: string;
  phone: string;
  display_name: string;
  role: AdminLevel;
  created_by?: {
    id: string;
    display_name: string;
  } | null;
  status: AdminStatus;
  /** ISO8601 */
  created_at: string;
  /** ISO8601 */
  updated_at: string;
}

/**
 * POST /admin/auth/login 的响应。refresh token 不在 body（在 admin_refresh_token cookie）。
 * 后端 flatten 结构：admin_profile 概要 + 平铺的 access token + refresh 死线。
 */
export interface AdminAuthResponse {
  /** 登录管理员概要（后端 AdminProfile：仅这 4 字段）；完整档案另经 GET /admin/profile 拉取。 */
  admin_profile: {
    id: string;
    display_name: string;
    phone: string;
    /** 身份等级——后端字段名统一为 role（Q11），值域同 AdminLevel。 */
    role: AdminLevel;
  };
  access_token: string;
  /** access token 剩余有效期（秒），约 900。 */
  expires_in: number;
  /** refresh token 过期的 Unix 时间戳（秒）。 */
  refresh_token_expires_at: number;
  /**
   * true = 该账号刚被重置密码，必须先改密。后端 must_change 守卫落地后才下发，
   * 当前恒 undefined；前端据此路由到改密流程。
   */
  must_change_password?: boolean;
}

/**
 * POST /admin/admins 请求体（超管建号）。对齐 openapi CreateAdminRequest。
 * 密码由后端生成（响应里一次性返回，见 CreateAdminResponse），等级恒为 admin
 * （不能经此接口建超管），故请求体不含 password / role。
 */
export interface CreateAdminInput {
  /** 5–20 位。 */
  phone: string;
  /** 1–50 字符；服务端 trim；含 < > 或控制/不可见字符 → 400；不传则自动生成。 */
  display_name?: string;
  /** 当前超级管理员手机号收到的 admin_create 验证码。 */
  code: string;
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

/** GET /admin/admins 查询参数（筛选条件同时传入时按 AND 组合）。 */
export interface AdminListQuery {
  role?: AdminLevel;
  phone?: string;
  display_name?: string;
  page?: number;
  page_size?: number;
}

/** GET /admin/admins 的响应。 */
export interface AdminListResponse {
  items: Admin[];
  pagination: AdminPaginationMeta;
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
