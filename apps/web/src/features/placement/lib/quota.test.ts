import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TESTS,
  readQuota,
  recordResult,
  resetQuota,
  type StorageLike
} from "./quota";
import { isBand, QuotaExhaustedError } from "./types";

function memStorage(): StorageLike & { dump(): Map<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    dump: () => m
  };
}

const KEY = "tsz.placement.quota";

describe("readQuota", () => {
  it("无存储(SSR)→ 空态", () => {
    expect(readQuota(null)).toEqual({ used: 0, last: null });
  });

  it("无记录 → 空态", () => {
    expect(readQuota(memStorage())).toEqual({ used: 0, last: null });
  });

  it("损坏的 JSON → 空态", () => {
    const s = memStorage();
    s.setItem(KEY, "{oops");
    expect(readQuota(s)).toEqual({ used: 0, last: null });
  });

  it("非法字段清洗:负数/超限次数、未知档位", () => {
    const s = memStorage();
    s.setItem(KEY, JSON.stringify({ used: -2, last: { band: "Z9", at: "x" } }));
    expect(readQuota(s)).toEqual({ used: 0, last: null });
    s.setItem(KEY, JSON.stringify({ used: 99, last: { band: "B1" } }));
    expect(readQuota(s)).toEqual({
      used: MAX_TESTS,
      last: { band: "B1", at: "" }
    });
  });
});

describe("recordResult / resetQuota", () => {
  let s: ReturnType<typeof memStorage>;
  beforeEach(() => {
    s = memStorage();
  });

  it("落账:次数 +1,结果覆盖(以最后一次为准,即使更低)", () => {
    recordResult("B2", "2026-07-18", s);
    expect(readQuota(s)).toEqual({
      used: 1,
      last: { band: "B2", at: "2026-07-18" }
    });
    recordResult("A2", "2026-07-19", s);
    expect(readQuota(s)).toEqual({
      used: 2,
      last: { band: "A2", at: "2026-07-19" }
    });
  });

  it("次数封顶 MAX_TESTS", () => {
    for (let i = 0; i < MAX_TESTS + 2; i++) recordResult("B1", "t", s);
    expect(readQuota(s).used).toBe(MAX_TESTS);
  });

  it("reset 清空", () => {
    recordResult("B1", "t", s);
    resetQuota(s);
    expect(readQuota(s)).toEqual({ used: 0, last: null });
  });

  it("默认存储走 localStorage(jsdom)", () => {
    window.localStorage.removeItem(KEY);
    recordResult("C1", "t");
    expect(readQuota().last?.band).toBe("C1");
    resetQuota();
    expect(readQuota()).toEqual({ used: 0, last: null });
  });
});

// 服务端渲染时没有 window,默认存储必须直接判空——碰一下 window.localStorage 就会抛。
describe("默认存储在 SSR 下的降级", () => {
  it("没有 window → 读到空态、写入静默跳过", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(readQuota()).toEqual({ used: 0, last: null });
      expect(() => recordResult("B2", "t")).not.toThrow();
      expect(() => resetQuota()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("types 辅助", () => {
  it("isBand 只认合法档位", () => {
    expect(isBand("B1")).toBe(true);
    expect(isBand("Z9")).toBe(false);
    expect(isBand(null)).toBe(false);
    expect(isBand(1)).toBe(false);
  });

  it("QuotaExhaustedError 可被 instanceof 识别", () => {
    const e = new QuotaExhaustedError();
    expect(e).toBeInstanceOf(QuotaExhaustedError);
    expect(e.name).toBe("QuotaExhaustedError");
    expect(e.message).toBe("quota_exhausted");
  });
});
