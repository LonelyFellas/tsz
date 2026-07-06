// 用户管理（C 端用户）数据层：React Query hooks。
//
// 数据源经 USE_MOCK_USERS 开关切换：
//   true  → 走 features/users/mock.ts（后端接口未齐时的兜底，页面按原型完整呈现）
//   false → 走真实 api.users.*（@tsz/api-client）
// 写操作（编辑/删除/启禁用）后端暂无接口，当前仅 mock 生效（见 backend-todos #4/#5）。
// 后端补齐后：关开关、把 mutation 换成真实 api.users.*、删除 mock.ts。
import type { AdminUserListResponse, AdminUserView } from "@tsz/types";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { api } from "@/lib/auth";
import { toUserListQuery, type UserListParams } from "./listQuery";
import {
  mockDeleteUser,
  mockListUsers,
  mockSetUserStatus,
  mockUpdateUser
} from "./mock";

/**
 * 是否使用前端 mock 数据源。后端 GET /admin/users 就绪且字段补齐后置为 false。
 * TODO(backend): 见 docs/features/admin-user-management/backend-todos.md。
 */
export const USE_MOCK_USERS = true;

type UserListResult = AdminUserListResponse & { items: AdminUserView[] };

export const userKeys = {
  all: ["admin-users"] as const,
  list: (params: UserListParams) => [...userKeys.all, "list", params] as const
};

async function fetchUsers(params: UserListParams): Promise<UserListResult> {
  if (USE_MOCK_USERS) return mockListUsers(params);
  return api.users.list(toUserListQuery(params));
}

export function useUserList(params: UserListParams) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => fetchUsers(params),
    // 翻页/改筛选时保留上一页数据，避免表格闪空。
    placeholderData: keepPreviousData
  });
}

/** 写操作共用：变更后失效列表缓存重取。 */
function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: userKeys.all });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    // TODO(backend): 换真实 api.users.update（backend-todos #5）。
    mutationFn: async (vars: { id: string; display_name: string }) =>
      mockUpdateUser(vars.id, { display_name: vars.display_name }),
    onSuccess: invalidate
  });
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    // TODO(backend): 换真实 api.users.remove（backend-todos #5）。
    mutationFn: async (id: string) => mockDeleteUser(id),
    onSuccess: invalidate
  });
}

export function useSetUserStatus() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    // TODO(backend): 换真实 api.users.setStatus（backend-todos #4）。
    mutationFn: async (vars: { id: string; status: "active" | "disabled" }) =>
      mockSetUserStatus(vars.id, vars.status),
    onSuccess: invalidate
  });
}
