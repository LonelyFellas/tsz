import { isBand, type Band } from "./types";

// 「共 3 次机会,以最后一次为准」的本地留存。
// mock 阶段次数权威在此;真后端落地后本模块降级为展示缓存,
// 次数校验以服务端 403 quota_exhausted 为准(见产品方案 §8.2)。

export const MAX_TESTS = 3;

const STORAGE_KEY = "tsz.placement.quota";

export interface QuotaState {
  /** 已完成(completed)的测试次数;invalid/退出/跳过不计。 */
  used: number;
  /** 最近一次完成的结果(以最后一次为准)。 */
  last: { band: Band; at: string } | null;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const EMPTY: QuotaState = { used: 0, last: null };

function defaultStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readQuota(
  storage: StorageLike | null = defaultStorage()
): QuotaState {
  if (!storage) return EMPTY;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    const used =
      typeof parsed.used === "number" && parsed.used > 0
        ? Math.min(Math.floor(parsed.used), MAX_TESTS)
        : 0;
    const last =
      parsed.last && isBand(parsed.last.band)
        ? { band: parsed.last.band, at: String(parsed.last.at ?? "") }
        : null;
    return { used, last };
  } catch {
    return EMPTY;
  }
}

/** 完成一次测试后落账:次数 +1(封顶),结果覆盖(即使更低)。 */
export function recordResult(
  band: Band,
  at: string,
  storage: StorageLike | null = defaultStorage()
): QuotaState {
  const prev = readQuota(storage);
  const next: QuotaState = {
    used: Math.min(MAX_TESTS, prev.used + 1),
    last: { band, at }
  };
  storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetQuota(
  storage: StorageLike | null = defaultStorage()
): void {
  storage?.removeItem(STORAGE_KEY);
}
