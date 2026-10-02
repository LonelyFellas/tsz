import { matchRoutes } from "react-router-dom";
import type { AdminProfile } from "@tsz/types";
import { hasAdminPermission } from "@tsz/shared/auth";

/** Router、直链守卫与已落地菜单共用路径及页面权限。匹配采用 Router 默认语义。 */
export const ADMIN_PAGE_ROUTES = {
  words: { path: "words", handle: { permission: "words.access" } },
  wordsTrash: { path: "words/trash", handle: { permission: "words.access" } },
  wordsNewV3: { path: "words/new/v3", handle: { permission: "words.create" } },
  wordsNew: { path: "words/new", handle: { permission: "words.create" } },
  wordWizard: {
    path: "words/:wordId/v3/wizard/:step",
    handle: { permission: "words.access" }
  },
  sentences: { path: "sentences", handle: { permission: "sentences.access" } },
  users: { path: "users", handle: { permission: "users.access" } },
  teacherApplications: {
    path: "teacher-applications",
    handle: { permission: "teacherapply.access" }
  },
  permissions: { path: "permissions", handle: { superOnly: true } },
  admins: { path: "admins", handle: { superOnly: true } },
  profileSettings: { path: "settings/profile", handle: {} },
  partsOfSpeech: {
    path: "settings/parts-of-speech",
    handle: { permission: "lexicon_settings.access" }
  }
} as const;

export function canVisitAdminRoute(
  profile: AdminProfile | null,
  pathname: string
): boolean {
  if (!profile) return false;
  const matches = matchRoutes(
    [{ path: "/", handle: {} }, ...Object.values(ADMIN_PAGE_ROUTES)],
    pathname
  );
  if (!matches) return false;
  const handle = matches.at(-1)?.route.handle as
    { permission?: string; superOnly?: boolean } | undefined;
  if (handle?.superOnly) return profile.role === "super_admin";
  return !handle?.permission || hasAdminPermission(profile, handle.permission);
}
