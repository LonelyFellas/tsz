import type { ReviewAnswerInput, StartReview } from "@tsz/types";
const PREFIX = "tsz:review-pending:";
export function pendingKey(user: string, scope: string) {
  return `${PREFIX}${user}:${scope}`;
}
export function readPending<T extends ReviewAnswerInput | StartReview>(
  user: string,
  scope: string
): T | null {
  try {
    const raw = localStorage.getItem(pendingKey(user, scope));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at: number; value: T };
    if (
      !Number.isFinite(saved.at) ||
      Date.now() - saved.at > 86400000 ||
      !saved.value?.idempotency_key
    ) {
      localStorage.removeItem(pendingKey(user, scope));
      return null;
    }
    return saved.value;
  } catch {
    return null;
  }
}
export function savePending(
  user: string,
  scope: string,
  value: ReviewAnswerInput | StartReview
) {
  localStorage.setItem(
    pendingKey(user, scope),
    JSON.stringify({ at: Date.now(), value })
  );
}
export function clearPending(user: string, scope: string) {
  try {
    localStorage.removeItem(pendingKey(user, scope));
  } catch {
    /* Storage may be unavailable. */
  }
}
export function clearUserPending(user: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${PREFIX}${user}:`)) localStorage.removeItem(key);
    }
  } catch {
    /* Account transitions must not depend on browser storage. */
  }
}
