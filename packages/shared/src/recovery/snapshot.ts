export interface DraftSnapshot<T> {
  schema: 1;
  revision: number;
  value: T;
}
const prefix = "tsz:recovery:";
export function snapshotKey(userId: string, entity: string) {
  return `${prefix}${encodeURIComponent(userId)}:${entity}`;
}
export function readSnapshot<T>(
  key: string,
  storage: Storage
): DraftSnapshot<T> | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== 1 ||
    !("revision" in value) ||
    typeof value.revision !== "number" ||
    !("value" in value)
  )
    throw new Error("备份格式不兼容");
  return value as DraftSnapshot<T>;
}
export function writeSnapshot<T>(
  key: string,
  revision: number,
  value: T,
  storage: Storage
) {
  // JSON 无法恢复临时媒体，不静默宣称已备份。
  const json = JSON.stringify({ schema: 1, revision, value }, (_key, field) => {
    if (
      (typeof Blob !== "undefined" && field instanceof Blob) ||
      (typeof field === "string" && field.startsWith("blob:"))
    )
      throw new Error("临时媒体尚未上传，无法备份");
    return field;
  });
  storage.setItem(key, json);
}
export function clearOtherSnapshots(userId: string | null, storage: Storage) {
  const keep =
    userId === null ? null : `${prefix}${encodeURIComponent(userId)}:`;
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(prefix) && (!keep || !key.startsWith(keep)))
      storage.removeItem(key);
  }
}
