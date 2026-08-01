// 管理员管理数据层：按 tsz-rust 当前已落地契约封装列表、建号和建号发码。
import type { AdminListQuery, CreateAdminInput } from "@tsz/types";
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
