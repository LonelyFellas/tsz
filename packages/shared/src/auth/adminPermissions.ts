/** 前端只匹配已实现的稳定业务 key，未知 key（包括通配符）永不授权。 */
export const ADMIN_PERMISSION_DEPENDENCIES = {
  "wordlists.access": [],
  "wordlists.review": ["wordlists.access"],
  "wordlists.withdraw": ["wordlists.access"],
  "coins.access": [],
  "coins.credit": ["coins.access"],
  "coins.reverse": ["coins.access"],
  "words.access": [],
  "words.create": ["words.access"],
  "words.detect": ["words.access"],
  "words.validate": ["words.access"],
  "words.edit": ["words.access"],
  "words.associate": ["words.access"],
  "words.edit_others": ["words.access"],
  "words.publish": ["words.access"],
  "words.archive": ["words.access"],
  "words.restore": ["words.access"],
  "words.rollback": ["words.access"],
  "sentences.access": [],
  "sentences.create": ["sentences.access"],
  "sentences.edit": ["sentences.access", "words.access"],
  "sentences.associate": ["sentences.access", "words.access"],
  "sentences.edit_others": ["sentences.access"],
  "sentences.publish": ["sentences.access"],
  "sentences.withdraw": ["sentences.access"],
  "sentences.restore": ["sentences.access"],
  "sentences.rollback": ["sentences.access"],
  "users.access": [],
  "users.edit": ["users.access"],
  "users.set_status": ["users.access"],
  "users.read_sensitive": ["users.access"],
  "teacherapply.access": [],
  "teacherapply.review": ["teacherapply.access"],
  "teacherapply.revoke": ["teacherapply.access"],
  "teacherapply.read_sensitive": ["teacherapply.access"],
  "lexicon_settings.access": [],
  "lexicon_settings.edit": ["lexicon_settings.access"],
  "speech.generate": ["words.access"]
} as const;

export type AdminPermissionKey = keyof typeof ADMIN_PERMISSION_DEPENDENCIES;
export interface AdminPermissionActor {
  id: string;
  role: string;
  permissions?: readonly string[];
}
export function hasAdminPermission(
  actor: AdminPermissionActor | null | undefined,
  key: string
): boolean {
  if (!actor || !Object.hasOwn(ADMIN_PERMISSION_DEPENDENCIES, key))
    return false;
  if (actor.role === "super_admin") return true;
  if (actor.role !== "admin") return false;
  if (!actor.permissions?.includes(key)) return false;
  return ADMIN_PERMISSION_DEPENDENCIES[key as AdminPermissionKey].every(
    (required) => hasAdminPermission(actor, required)
  );
}
export function hasAnyAdminPermission(
  actor: AdminPermissionActor | null | undefined,
  keys: readonly string[]
): boolean {
  return keys.some((key) => hasAdminPermission(actor, key));
}
/** edit_others 只扩展编辑范围；发布、生命周期不借用此范围权限。 */
export function canAdminResourceAction(
  actor: AdminPermissionActor | null | undefined,
  module: "words" | "sentences",
  action:
    | "edit"
    | "associate"
    | "publish"
    | "archive"
    | "withdraw"
    | "restore"
    | "rollback",
  createdBy: string | undefined
): boolean {
  return (
    hasAdminPermission(actor, `${module}.${action}`) &&
    Boolean(
      actor &&
      (actor.role === "super_admin" ||
        (Boolean(createdBy) && createdBy === actor.id) ||
        ((action === "edit" || action === "associate") &&
          hasAdminPermission(actor, `${module}.edit_others`)))
    )
  );
}
