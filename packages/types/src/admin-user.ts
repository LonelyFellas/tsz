// 后台「用户管理」里看到的 C 端用户（web 学员/教师）—— 1:1 镜像 openapi `AdminAccountUserResponse`。
// 基本资料与联系方式由后端按独立权限裁剪。
import type { LearningSettings, Role } from "./user";
import type { AdminPaginationMeta } from "./admin";

/**
 * GET /admin/users 列表项。名单必含 id、display_name、created_at。
 * 基本资料需 users.read_basic；phone / email 需 users.read_sensitive，未授权或未绑定时省略。
 */
export interface AdminUser {
  id: string;
  /** 无手机的邮箱账号省略。 */
  phone?: string;
  /** 未设置时省略。 */
  email?: string;
  display_name: string;
  /** 头像绝对地址；未设置为 ""。 */
  avatar_url?: string;
  /** 师生合一：一个账号可同时持有 student / teacher。 */
  roles?: Role[];
  teacher_verified?: boolean;
  /** 学生等级与英美式偏好；需 users.read_basic，未配置时为 null。 */
  learning_settings?: LearningSettings | null;
  status?: "active" | "disabled";
  /** ISO8601 注册时间。 */
  created_at: string;
  /** ISO8601 更新时间。 */
  updated_at?: string;
}

/** GET /admin/users/{id}/registration-region；仅独立地区权限可读取。 */
export type UserRegistrationRegion =
  | { city: string; status: "resolved" }
  | { city: null; status: "not_recorded" | "unknown" };

/** GET /admin/users 查询参数（按持有角色 / 关键字 / 注册时间过滤 + 分页）。 */
export interface AdminUserListQuery {
  /** 按持有角色过滤；不传 = 全部。 */
  role?: "student" | "teacher";
  /** 手机 / 邮箱 / 昵称的自由文本匹配（后端按字面子串，% _ 不作通配）。 */
  q?: string;
  /** 注册时间下界（含，RFC3339）。与 registered_to 组成半开区间 [from, to)。 */
  registered_from?: string;
  /** 注册时间上界（不含，RFC3339）。 */
  registered_to?: string;
  page?: number;
  page_size?: number;
}

/** PATCH /admin/users/{id} 请求体（本轮仅昵称可编辑，1–50 字符）。 */
export interface AdminUserUpdateInput {
  display_name: string;
}

/** GET /admin/users 的响应。 */
export interface AdminUserListResponse {
  items: AdminUser[];
  page: AdminPaginationMeta;
}

/** 用户账单独立于余额授权；未授权余额时不返回逐笔余额。 */
export interface AdminUserCoinEntryPage extends Omit<
  import("./coins").CoinEntryPage,
  "items"
> {
  items: Array<
    Omit<import("./coins").CoinEntry, "balance_after"> & {
      balance_after?: string;
    }
  >;
}
