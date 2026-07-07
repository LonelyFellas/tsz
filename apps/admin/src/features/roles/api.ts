// 角色治理数据层：React Query hooks 包 api.roles.* / api.admins.setRole（@tsz/api-client）。
// 全部接口要求 super_admin（后端已实现）；写操作成功后失效角色列表重取
// （member_count / 权限集变了）。权限目录基本不变，缓存较久以减少来回。
import type { CreateRoleRequest, UpdateRoleRequest } from "@tsz/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth";

export const roleKeys = {
  all: ["admin-roles"] as const,
  list: () => [...roleKeys.all, "list"] as const,
  permissions: () => [...roleKeys.all, "permissions"] as const
};

/** GET /admin/permissions — 权限目录（渲染勾选框；顺序即侧栏顺序）。基本不变，缓存 5 分钟。 */
export function usePermissionCatalog() {
  return useQuery({
    queryKey: roleKeys.permissions(),
    queryFn: () => api.roles.permissions(),
    staleTime: 5 * 60 * 1000
  });
}

/** GET /admin/roles — 角色列表（系统角色最前，permissions 按 key 字母序）。 */
export function useRoleList() {
  return useQuery({
    queryKey: roleKeys.list(),
    queryFn: () => api.roles.list()
  });
}

/** 失效角色列表：写操作成功、或并发 404 后手动重取时用。 */
export function useInvalidateRoles() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: roleKeys.list() });
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (input: CreateRoleRequest) => api.roles.create(input),
    onSuccess: invalidate
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateRoleRequest }) =>
      api.roles.update(vars.id, vars.input),
    onSuccess: invalidate
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (id: string) => api.roles.remove(id),
    onSuccess: invalidate
  });
}

/** 给普通管理员派 / 换 / 清角色。204 后重拉角色列表刷新 member_count。 */
export function useSetAdminRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (vars: { adminId: string; roleId: string | null }) =>
      api.admins.setRole(vars.adminId, vars.roleId),
    onSuccess: invalidate
  });
}
