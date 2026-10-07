import type { HttpClient } from "./http";
import type {
  AdminPermissions,
  UnifiedPermissionCatalog,
  PermissionPreviewInput,
  PermissionPreviewResponse,
  PermissionChangeInput,
  PermissionChangeResponse,
  PermissionTag,
  PermissionTagChangeInput,
  GrantedAdminsResponse,
  PermissionAuditsResponse,
  AdminProfile
} from "@tsz/types";

export const ADMIN_PERMISSION_UPGRADE_MESSAGE =
  "当前后台版本不支持权限设置，请升级后台服务后再登录";

export class InvalidAdminProfileResponseError extends Error {
  constructor() {
    super(ADMIN_PERMISSION_UPGRADE_MESSAGE);
  }
}

/** 旧 profile 不提供授权事实时，拒绝建立已授权身份，不能回退全权。 */
export function decodeAdminProfile(value: unknown): AdminProfile {
  const profile = value as Partial<AdminProfile> | null;
  if (
    !profile ||
    typeof profile !== "object" ||
    typeof profile.id !== "string" ||
    !profile.id ||
    (profile.role !== "admin" && profile.role !== "super_admin") ||
    !Number.isSafeInteger(profile.permission_version) ||
    profile.permission_version! < 0 ||
    typeof profile.catalog_version !== "string" ||
    !profile.catalog_version ||
    !strings(profile.permissions)
  ) {
    throw new InvalidAdminProfileResponseError();
  }
  return profile as AdminProfile;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((key) => typeof key === "string");
}
function expectedTargets(
  targets: { admin_id: string }[],
  ids: string[]
): boolean {
  const actual = new Set(targets.map((target) => target.admin_id));
  return (
    targets.length === ids.length &&
    actual.size === ids.length &&
    ids.every((id) => actual.has(id))
  );
}
function decodePreview(
  value: unknown,
  input: PermissionPreviewInput
): PermissionPreviewResponse {
  const preview = value as PermissionPreviewResponse | null;
  if (
    !preview ||
    typeof preview.catalog_version !== "string" ||
    !preview.catalog_version ||
    preview.catalog_version !== input.catalog_version ||
    !Array.isArray(preview.targets) ||
    !preview.targets.every(
      (target) =>
        target &&
        typeof target.admin_id === "string" &&
        Number.isSafeInteger(target.expected_version) &&
        target.expected_version >= 0 &&
        [
          target.before,
          target.after,
          target.grant,
          target.revoke,
          target.dependency_grants,
          target.dependency_revocations
        ].every(strings)
    ) ||
    !expectedTargets(
      preview.targets,
      input.targets.map((target) => target.admin_id)
    )
  ) {
    throw new Error("权限调整结果不完整，请重新查看");
  }
  return preview;
}
function decodeChange(
  value: unknown,
  input: PermissionChangeInput
): PermissionChangeResponse {
  const result = value as PermissionChangeResponse | null;
  if (
    !result ||
    typeof result.request_id !== "string" ||
    !result.request_id ||
    !Array.isArray(result.targets) ||
    !result.targets.every(
      (target) =>
        target &&
        typeof target.admin_id === "string" &&
        Number.isSafeInteger(target.permission_version) &&
        target.permission_version >= 0 &&
        typeof target.catalog_version === "string" &&
        target.catalog_version === input.catalog_version &&
        strings(target.permissions)
    ) ||
    !expectedTargets(
      result.targets,
      input.targets.map((target) => target.admin_id)
    )
  ) {
    throw new Error("保存响应不完整，请重新查看当前权限");
  }
  return result;
}

export function createPermissionEndpoints(http: HttpClient) {
  return {
    catalog: () => http.get<UnifiedPermissionCatalog>("/permissions"),
    forAdmin: (id: string) =>
      http.get<AdminPermissions>(
        `/admins/${encodeURIComponent(id)}/permissions`
      ),
    grantedAdmins: (key: string, page = 1, page_size = 20) =>
      http.get<GrantedAdminsResponse>(
        `/permissions/${encodeURIComponent(key)}/admins?page=${page}&page_size=${page_size}`
      ),
    preview: (input: PermissionPreviewInput) =>
      http
        .post<unknown>("/permission-changes/preview", input)
        .then((value) => decodePreview(value, input)),
    commit: (input: PermissionChangeInput) =>
      http
        .post<unknown>("/permission-changes", input)
        .then((value) => decodeChange(value, input)),
    tags: () => http.get<PermissionTag[]>("/permission-tags"),
    createTag: (name: string, color: string) =>
      http.post<PermissionTag>("/permission-tags", { name, color }),
    updateTag: (
      id: string,
      name: string,
      color: string,
      expected_version: number
    ) =>
      http.patch<void>(`/permission-tags/${encodeURIComponent(id)}`, {
        name,
        color,
        expected_version
      }),
    deleteTag: (id: string, expected_version: number) =>
      http.del<void>(
        `/permission-tags/${encodeURIComponent(id)}?expected_version=${expected_version}`
      ),
    changeTags: (input: PermissionTagChangeInput) =>
      http.post<PermissionTag[]>("/permission-tag-changes", input),
    audits: (
      query: {
        admin_id?: string;
        permission_key?: string;
        since?: string;
        until?: string;
        page?: number;
        page_size?: number;
      } = {}
    ) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return http.get<PermissionAuditsResponse>(`/permission-audits?${params}`);
    }
  };
}
