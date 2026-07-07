// 后台 RBAC「角色治理」的 wire 类型 —— 1:1 镜像后端 openapi 的 `Admin (roles)` 标签
// schema，字段一律 snake_case。这是 RBAC 第二段：超管建角色 / 配权限子集 / 派给管理员
// （第一段「按角色渲染菜单」的 profile.permissions 见 ./admin AdminProfile）。
//
// 全部接口超管专属（super_admin），详见 docs/admin-rbac-frontend-integration.md。
import type { MenuPermission } from "./admin";

/**
 * 一个可委派权限 key —— 每个侧栏菜单叶子一个。与第一段的 `MenuPermission`（profile 下发的
 * 菜单 key）是同一份后端目录（internal/authz），故此处直接别名，避免两处枚举漂移。
 */
export type PermissionKey = MenuPermission;

/** 权限目录项（GET /admin/permissions 的元素）：key + 中文菜单名，直接做勾选框文案。 */
export interface PermissionCatalogItem {
  key: PermissionKey;
  /** 中文菜单名，如「智能词库」。 */
  label: string;
}

/** GET /admin/permissions 的响应：权限目录，顺序即侧栏自上而下顺序。 */
export interface PermissionCatalogResponse {
  items: PermissionCatalogItem[];
}

/**
 * 一个后台角色：一组可委派权限 key 的具名集合，派给普通管理员以驱动其侧栏菜单。
 * 1:1 镜像 openapi `AdminRole`（名字避开 web 端已有的 ./user `Role`，故叫 AdminRole）。
 */
export interface AdminRole {
  /** uuid */
  id: string;
  name: string;
  description: string;
  /**
   * true = 迁移预置的「全功能管理员」系统角色：只读，禁改禁删（UI 应置灰，后端 403 兜底）。
   */
  is_system: boolean;
  /**
   * 该角色持有的权限 key 集合，**按 key 字母序**返回（非侧栏/目录顺序）。当集合用：
   * 渲染时以权限目录为骨架对本集合打勾，别按本数组顺序渲染。空数组 = 仅首页。恒为数组。
   */
  permissions: PermissionKey[];
  /** 当前绑定该角色的管理员数量（删角色前用它做「N 名将降级为仅首页」二次确认）。 */
  member_count: number;
  /** RFC3339 */
  created_at: string;
  /** RFC3339 */
  updated_at: string;
}

/** GET /admin/roles 的响应：系统角色排最前，其后按名称大小写不敏感排序。 */
export interface RoleListResponse {
  items: AdminRole[];
}

/** POST /admin/roles 请求体（建角色）。 */
export interface CreateRoleRequest {
  /** 必填，1–50 字符，去空白后非空、不含 < > 或不可见字符；大小写不敏感唯一。 */
  name: string;
  /** 选填，≤200 字符。 */
  description?: string;
  /** 选填，省略 / 空数组 = 建一个「仅首页」角色；每个 key 必须在目录内。 */
  permissions?: PermissionKey[];
}

/**
 * PATCH /admin/roles/{roleId} 请求体（改角色，部分更新语义）。
 * 省略 / 不传的字段不改；`permissions` 一旦出现（含空数组 []）= **全量替换**整个 key 集。
 */
export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  /** 传数组（含 []）= 全量替换；不传 = 不动权限。 */
  permissions?: PermissionKey[];
}

/**
 * PATCH /admin/admins/{adminId}/role 请求体（给普通管理员派 / 换 / 清角色）。
 * role_id 传 null = 收回角色（降为仅首页）。超管不挂角色（派给超管回 403）。
 */
export interface SetAdminRoleRequest {
  role_id: string | null;
}
