// 管理员管理数据层：React Query hooks 包 api.admins.*（@tsz/api-client）。
// 全部接口要求 super_admin（后端已实现）；写操作后失效列表重取。
import type { AdminListQuery, AdminStatus, CreateAdminInput } from "@tsz/types";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { api } from "@/lib/auth";

export const adminKeys = {
  all: ["admin-admins"] as const,
  list: (query: AdminListQuery) => [...adminKeys.all, "list", query] as const
};

export function useAdminList(query: AdminListQuery) {
  return useQuery({
    queryKey: adminKeys.list(query),
    queryFn: () => api.admins.list(query),
    placeholderData: keepPreviousData
  });
}

function useInvalidateAdmins() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: adminKeys.all });
}

export function useCreateAdmin() {
  const invalidate = useInvalidateAdmins();
  return useMutation({
    mutationFn: (input: CreateAdminInput) => api.admins.create(input),
    onSuccess: invalidate
  });
}

export function useSetAdminStatus() {
  const invalidate = useInvalidateAdmins();
  return useMutation({
    mutationFn: (vars: { id: string; status: AdminStatus }) =>
      api.admins.setStatus(vars.id, vars.status),
    onSuccess: invalidate
  });
}

export function useResetAdminPassword() {
  return useMutation({
    mutationFn: (id: string) => api.admins.resetPassword(id)
  });
}
