// 管理员管理数据层：按 tsz-rust 当前已落地契约封装列表、建号发码、建号、启禁用与重置密码。
// 全部端点要求 super_admin；改动列表内容的写操作成功后失效列表重取。
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

export function useRequestCreateAdminCode() {
  return useMutation({
    mutationFn: () => api.admins.requestCreateCode()
  });
}

/** PATCH /admin/admins/{id}/status — 启用/禁用某普通管理员（超管不可被操作 → 403）。 */
export function useSetAdminStatus() {
  const invalidate = useInvalidateAdmins();
  return useMutation({
    mutationFn: (vars: { id: string; status: AdminStatus }) =>
      api.admins.setStatus(vars.id, vars.status),
    onSuccess: invalidate
  });
}

/**
 * POST /admin/admins/{id}/reset-password — 重置为一次性临时密码（明文仅返回一次）。
 * 不动列表里的任何字段（只吊销目标会话），故无需失效列表。
 */
export function useResetAdminPassword() {
  return useMutation({
    mutationFn: (id: string) => api.admins.resetPassword(id)
  });
}
