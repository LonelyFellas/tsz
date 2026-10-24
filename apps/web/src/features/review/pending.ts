import type { ReviewAnswerInput, StartReview } from "@tsz/types";
const PREFIX = "tsz:review-pending:";
const MAX_AGE = 86400000;
type Pending = { at: number; value: ReviewAnswerInput | StartReview };
const memory = new Map<string, Pending>();
export function pendingKey(user: string, scope: string) {
  return `${PREFIX}${user}:${scope}`;
}
function parse(raw: string | null): Pending | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Pending;
    return Number.isFinite(saved.at) &&
      Date.now() - saved.at <= MAX_AGE &&
      typeof saved.value?.idempotency_key === "string"
      ? saved
      : null;
  } catch {
    return null;
  }
}
function prune(user: string) {
  const prefix = `${PREFIX}${user}:`;
  for (const [key, saved] of memory) {
    if (key.startsWith(prefix) && Date.now() - saved.at > MAX_AGE)
      memory.delete(key);
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && !parse(localStorage.getItem(key)))
        localStorage.removeItem(key);
    }
  } catch {
    /* In-memory recovery still works when storage is unavailable. */
  }
}
export function readPending<T extends ReviewAnswerInput | StartReview>(
  user: string,
  scope: string
): T | null {
  prune(user);
  const key = pendingKey(user, scope);
  try {
    const saved = parse(localStorage.getItem(key));
    if (saved) {
      memory.set(key, saved);
      return saved.value as T;
    }
  } catch {
    /* Use the current page's pending request. */
  }
  return (memory.get(key)?.value as T | undefined) ?? null;
}
export function savePending(
  user: string,
  scope: string,
  value: ReviewAnswerInput | StartReview
) {
  prune(user);
  const key = pendingKey(user, scope);
  const saved = { at: Date.now(), value };
  memory.set(key, saved);
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    /* Storage is an optional recovery aid. */
  }
}
export function clearPending(user: string, scope: string, expectedKey: string) {
  const key = pendingKey(user, scope);
  if (memory.get(key)?.value.idempotency_key === expectedKey)
    memory.delete(key);
  try {
    const saved = parse(localStorage.getItem(key));
    if (saved?.value.idempotency_key === expectedKey)
      localStorage.removeItem(key);
  } catch {
    /* Account transitions must not depend on browser storage. */
  }
}
export function clearUserPending(user: string) {
  const prefix = `${PREFIX}${user}:`;
  for (const key of memory.keys())
    if (key.startsWith(prefix)) memory.delete(key);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    /* Account transitions must not depend on browser storage. */
  }
}
