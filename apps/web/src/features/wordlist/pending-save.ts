import type { CreateWordlist, UpdateWordlist } from "@tsz/types";

export type WordlistSave =
  | { kind: "create"; body: CreateWordlist }
  | { kind: "update"; id: string; body: UpdateWordlist };
export function pendingSaveKey(userId: string, id?: string, folderId?: string) {
  return `tsz:wordlist-save:${userId}:${id ? `edit:${id}` : `new:${folderId ?? "root"}`}`;
}
export function readPendingSave<T>(
  key: string
): { request: WordlistSave; form: T } | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(key);
  if (!saved) return null;
  const value = JSON.parse(saved) as { request: WordlistSave; form: T };
  if (
    !value.request?.body ||
    !["create", "update"].includes(value.request.kind) ||
    !value.form
  )
    throw new Error("待确认的词表保存记录无法读取，请保留此页面并联系支持。");
  return value;
}
export function writePendingSave<T>(
  key: string,
  request: WordlistSave,
  form: T
) {
  // Persist before dispatch: even a refresh while the request is in flight must replay it.
  localStorage.setItem(key, JSON.stringify({ request, form }));
}
