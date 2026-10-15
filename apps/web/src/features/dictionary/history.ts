const LIMIT = 20;
const key = (userId: string) => `tsz:dictionary:history:${userId}`;
export function normalizeTerm(term: string) {
  return term.normalize("NFKC").trim().replace(/\s+/g, " ");
}
export function addHistory(history: string[], term: string) {
  const word = normalizeTerm(term);
  if (!word || word.length > 100) return history;
  return [
    word,
    ...history.filter((item) => item.toLowerCase() !== word.toLowerCase())
  ].slice(0, LIMIT);
}
export function parseHistory(snapshot: string): string[] {
  try {
    const data: unknown = JSON.parse(snapshot);
    if (!Array.isArray(data)) return [];
    return data
      .filter((v): v is string => typeof v === "string")
      .reverse()
      .reduce((all, value) => addHistory(all, value), [] as string[]);
  } catch {
    return [];
  }
}
export function historySnapshot(userId?: string) {
  try {
    return userId ? (localStorage.getItem(key(userId)) ?? "[]") : "[]";
  } catch {
    return "[]";
  }
}
export function readHistory(userId: string) {
  return parseHistory(historySnapshot(userId));
}
export function subscribeHistory(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("tsz-dictionary-history", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("tsz-dictionary-history", listener);
  };
}
export function writeHistory(userId: string, terms: string[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(terms));
    window.dispatchEvent(new Event("tsz-dictionary-history"));
  } catch {
    /* 查词不依赖本地存储可用性。 */
  }
}
