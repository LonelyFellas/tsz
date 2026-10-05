// 统一权限系统的 wire 契约，镜像 admin/permissions/model.rs。
export interface PermissionDefinition {
  key: string;
  module_key: string;
  label: string;
  description: string;
  kind: string;
  requires: string[];
  risk_level: string;
}
export interface PermissionTag {
  id: string;
  name: string;
  version: number;
  permissions: string[];
}
export interface UnifiedPermissionCatalog {
  catalog_version: string;
  permissions: PermissionDefinition[];
  tags: PermissionTag[];
}
export interface AdminPermissions {
  admin_id: string;
  permission_version: number;
  permissions: string[];
  catalog_version: string;
}
export interface PermissionPreviewInput {
  catalog_version: string;
  targets: { admin_id: string; expected_version?: number | null }[];
  grant: string[];
  revoke: string[];
}
export interface PermissionChangePreview {
  admin_id: string;
  expected_version: number;
  before: string[];
  after: string[];
  grant: string[];
  revoke: string[];
  dependency_grants: string[];
  dependency_revocations: string[];
}
export interface PermissionPreviewResponse {
  catalog_version: string;
  targets: PermissionChangePreview[];
}
export interface PermissionChangeInput {
  catalog_version: string;
  targets: {
    admin_id: string;
    expected_version: number;
    grant: string[];
    revoke: string[];
  }[];
}
export interface PermissionChangeResponse {
  request_id: string;
  targets: AdminPermissions[];
}
export interface PermissionTagChangeInput {
  catalog_version: string;
  targets: {
    tag_id: string;
    expected_version: number;
    add: string[];
    remove: string[];
  }[];
}
export interface GrantedAdminsResponse {
  items: {
    admin_id: string;
    display_name: string;
    permission_version: number;
  }[];
  total: number;
  page: number;
  page_size: number;
  super_admins_are_implicit: boolean;
}
export interface PermissionAuditsResponse {
  items: {
    id: string;
    actor_admin_id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    request_id: string;
    metadata: unknown;
    occurred_at: string;
  }[];
  total: number;
  page: number;
  page_size: number;
}
