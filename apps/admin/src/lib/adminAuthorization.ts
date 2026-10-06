import type { QueryClient } from "@tanstack/react-query";
import type { AdminProfile } from "@tsz/types";
import {
  ADMIN_PERMISSION_DEPENDENCIES,
  hasAdminPermission,
  type AdminAuthStore
} from "@tsz/shared/auth";

/** 只有账号切换/退出才重建后台组件树；授权版本不是组件 identity。 */
export function adminAccountIdentity(profile: AdminProfile | null): string {
  return profile?.id ?? "anonymous";
}

export function adminAuthorizationIdentity(
  profile: AdminProfile | null
): string {
  return profile
    ? JSON.stringify([
        profile.id,
        profile.role,
        profile.permission_version,
        profile.catalog_version,
        [...profile.permissions].sort()
      ])
    : "anonymous";
}

const MODULE_QUERY_ROOTS: Record<string, readonly string[]> = {
  coins: ["admin-coins"],
  words: ["admin-words", "inbound-references"],
  sentences: [
    "shared-sentences",
    "sentence-publications",
    "sentence-withdrawal-impact"
  ],
  users: ["admin-users"],
  teacherapply: ["teacher-applications", "teacher-application"],
  lexicon_settings: ["part-of-speech-config"],
  speech: ["admin-words"]
};

/** 账号切换全清；失权仅清受影响模块，增权不清除当前编辑页及其查询。 */
export function bindAdminAuthorizationCache(
  store: AdminAuthStore,
  client: QueryClient
): () => void {
  return store.subscribe((state, previous) => {
    const before = previous.profile;
    const after = state.profile;
    if (
      adminAuthorizationIdentity(after) === adminAuthorizationIdentity(before)
    )
      return;
    if (
      adminAccountIdentity(after) !== adminAccountIdentity(before) ||
      before?.catalog_version !== after?.catalog_version
    ) {
      void client.cancelQueries();
      client.clear();
      return;
    }
    const roots = new Set<string>();
    for (const key of Object.keys(ADMIN_PERMISSION_DEPENDENCIES)) {
      if (hasAdminPermission(before, key) && !hasAdminPermission(after, key)) {
        for (const root of MODULE_QUERY_ROOTS[key.split(".")[0]!] ?? [])
          roots.add(root);
      }
    }
    if (before?.role === "super_admin" && after?.role !== "super_admin") {
      for (const root of [
        "admin-coins",
        "admin-admins",
        "admin-roles",
        "permission-system",
        "permission-preview"
      ])
        roots.add(root);
    }
    if (!roots.size) return;
    const filter = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        roots.has(String(query.queryKey[0]))
    };
    void client.cancelQueries(filter);
    client.removeQueries(filter);
  });
}
