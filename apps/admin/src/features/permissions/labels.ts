import type { PermissionDefinition } from "@tsz/types";

export const MODULE_LABELS: Record<string, string> = {
  wordlists: "词表管理",
  coins: "天生币管理",
  words: "词库管理",
  sentences: "例句管理",
  users: "用户管理",
  teacherapply: "教师管理",
  lexicon_settings: "词性词形管理",
  speech: "语音合成管理"
};

export function permissionModules(
  permission: Pick<PermissionDefinition, "key" | "module_key">
): string[] {
  return permission.key === "speech.upload_audio"
    ? ["words", "speech"]
    : [permission.module_key];
}
