// C 端「用户管理」的**前端 mock 数据层**——集中隔离、可一键切换、易删。
//
// 为什么存在：后端 GET /admin/users 契约冻结但字段/筛选/写操作尚未齐备
// （见 docs/features/admin-user-management/backend-todos.md）。本文件让页面按产品原型
// 完整呈现（含头像/等级/更新时间列、注册时间过滤、编辑/删除/启禁用），后端补齐后
// 把 features/users/api.ts 的 USE_MOCK_USERS 关掉、替换为真实 api.users.* 并删除本文件即可。
//
// TODO(backend): 见 backend-todos.md #1（字段）/#2（时间筛选）/#3（详情）/#4（启禁用）/#5（编辑删除）。
import type { AdminUserListResponse, AdminUserView, Role } from "@tsz/types";
import type { UserListParams } from "./listQuery";

/** mock 用户视图（含契约外的 avatar_url/level/updated_at），必填以便渲染。 */
type MockUser = Required<
  Pick<AdminUserView, "id" | "display_name" | "roles" | "status" | "created_at">
> &
  Pick<AdminUserView, "phone" | "email" | "coin_balance"> & {
    avatar_url: string;
    level: string;
    updated_at: string;
  };

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const NAMES = [
  "record",
  "work out",
  "attitude",
  "electronic",
  "circuit",
  "chewing",
  "transparent",
  "screen",
  "aged",
  "harbor",
  "melody",
  "gravity",
  "novel",
  "pioneer",
  "quartz",
  "ribbon"
];

/** 生成一批确定性的 mock 用户（按注册时间倒序，最新在前）。 */
function seed(): MockUser[] {
  const base = Date.parse("2025-11-02T13:34:23Z");
  return NAMES.map((name, i) => {
    const isTeacher = i % 3 === 1;
    const roles: Role[] = isTeacher ? ["teacher"] : ["student"];
    const hasPhone = i % 4 !== 2;
    const hasEmail = i % 5 !== 3;
    const created = new Date(base - i * 86_400_000).toISOString();
    return {
      id: String(10112323 - i),
      display_name: name,
      roles,
      status: i % 7 === 6 ? "disabled" : "active",
      avatar_url: "",
      level: LEVELS[i % LEVELS.length]!,
      coin_balance: 2332 - i * 7,
      phone: hasPhone
        ? `1${(9434129071 + i * 13).toString().slice(0, 10)}`
        : undefined,
      email: hasEmail ? `${name.replace(/\s/g, "")}${i}@qq.com` : undefined,
      created_at: created,
      updated_at: new Date(base - i * 3_600_000).toISOString()
    };
  });
}

// 模块级可变态：mock 的写操作（编辑/删除/启禁用）就地改这里，配合 React Query 失效重取生效。
let users: MockUser[] = seed();

/** 仅测试用：把 mock 数据复位到初始种子，避免用例间相互污染。 */
export function __resetMockUsers(): void {
  users = seed();
}

function matches(u: MockUser, params: UserListParams): boolean {
  const { filters, role } = params;
  if (role !== "all" && !u.roles.includes(role)) return false;
  if (filters.nickname && !u.display_name.includes(filters.nickname.trim())) {
    return false;
  }
  if (filters.phone && !(u.phone ?? "").includes(filters.phone.trim())) {
    return false;
  }
  if (filters.email && !(u.email ?? "").includes(filters.email.trim())) {
    return false;
  }
  if (filters.registeredDate) {
    const day = filters.registeredDate.format("YYYY-MM-DD");
    if (!u.created_at.startsWith(day)) return false;
  }
  return true;
}

/** mock 列表：客户端过滤 + 分页，形状与真实 AdminUserListResponse 一致（items 为视图）。 */
export function mockListUsers(params: UserListParams): AdminUserListResponse & {
  items: AdminUserView[];
} {
  const filtered = users.filter((u) => matches(u, params));
  const { page, pageSize } = params;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return {
    items,
    page: { page, page_size: pageSize, total: filtered.length }
  };
}

/** mock 编辑：改昵称（原型「编辑」的最小可演示形态）。 */
export function mockUpdateUser(
  id: string,
  patch: { display_name: string }
): void {
  const u = users.find((x) => x.id === id);
  if (u) {
    u.display_name = patch.display_name;
    u.updated_at = new Date().toISOString();
  }
}

/** mock 删除。 */
export function mockDeleteUser(id: string): void {
  users = users.filter((x) => x.id !== id);
}

/** mock 启用/禁用。 */
export function mockSetUserStatus(
  id: string,
  status: "active" | "disabled"
): void {
  const u = users.find((x) => x.id === id);
  if (u) {
    u.status = status;
    u.updated_at = new Date().toISOString();
  }
}
