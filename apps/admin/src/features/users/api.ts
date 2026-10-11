// 用户管理（C 端用户）数据层：列表已对接真实 api.users.list（@tsz/api-client）。
// 编辑 / 启禁用 hooks 为后续后端接口预留，当前页面不会调用。
import type { AdminUserListResponse, AdminUserView } from "@tsz/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, usePermission } from "@/lib/auth";
import { toUserListQuery, type UserListParams } from "./listQuery";

// 列表项 wire 是 AdminUser；组件按 AdminUserView（多一个可选 level）渲染，
// level 后端未返回、恒为 undefined（列表列显示「-」），故 AdminUser 天然满足此视图。
type UserListResult = AdminUserListResponse & { items: AdminUserView[] };

export const userKeys = {
  all: ["admin-users"] as const,
  list: (params: UserListParams, viewScope: string) =>
    [...userKeys.all, "list", viewScope, params] as const
};

export function useUserList(params: UserListParams) {
  const canReadBasic = usePermission("users.read_basic");
  const canReadSensitive = usePermission("users.read_sensitive");
  const viewScope = `${canReadBasic}:${canReadSensitive}`;
  return useQuery<UserListResult>({
    queryKey: userKeys.list(params, viewScope),
    queryFn: () => api.users.list(toUserListQuery(params)),
    // 仅同一读取权限范围内的翻页/筛选复用旧数据；增权必须等待完整响应。
    placeholderData: (previous, query) =>
      query?.queryKey[2] === viewScope ? previous : undefined
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
    mutationFn: (vars: { id: string; display_name: string }) =>
      api.users.update(vars.id, { display_name: vars.display_name }),
    onSuccess: invalidate
  });
}

export function useSetUserStatus() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (vars: { id: string; status: "active" | "disabled" }) =>
      api.users.setStatus(vars.id, vars.status),
    onSuccess: invalidate
  });
}
