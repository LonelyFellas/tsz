import type { RichText } from "@tsz/types";

/**
 * 后台词条树节点的稳定 UUID。randomUUID 在非安全上下文不可用，测试线可能仍是 HTTP，
 * 因此保留 getRandomValues 兜底。
 */
export function newWordNodeId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 文本未改变时保留标记；改变后清空已经失效的 code-point offsets。 */
export function toWordRichText(text: string, original?: RichText): RichText {
  if (original?.text === text) return original;
  return { version: 1, text, spans: [], liaisons: [] };
}

export function emptyWordRichText(): RichText {
  return toWordRichText("");
}

export function cloneWordValue<T>(value: T): T {
  return structuredClone(value);
}

export function moveWordNode<T>(items: T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length ||
    from === to
  ) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}
