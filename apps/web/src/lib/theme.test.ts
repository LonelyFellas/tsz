import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  getResolvedFromDom,
  getStoredTheme,
  resolveTheme,
  setTheme,
  subscribeTheme,
  themeInitScript
} from "./theme";

// 受控的 MediaQueryList 替身:记录注册的 change 回调,便于手动触发「系统配色变化」。
function stubMatchMedia(matches: boolean) {
  const handlers = new Set<() => void>();
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: () => void) => handlers.add(cb),
    removeEventListener: (_: string, cb: () => void) => handlers.delete(cb)
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql)
  );
  return { fire: () => handlers.forEach((h) => h()) };
}

// 这套 jsdom 配置的 localStorage 实现不完整,装一个 Map 支撑的内存替身。
let storage: Storage;
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    }
  };
}

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal("localStorage", storage);
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTheme", () => {
  it("显式 light / dark 原样返回", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("system 跟随系统深色偏好", () => {
    stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
  });

  it("system 在系统浅色时为 light", () => {
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("matchMedia 不可用(如 jsdom)时 system 回退为 light", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("getStoredTheme", () => {
  it("未保存时为 system", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("读取已保存的 light / dark", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("非法值视为 system", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(getStoredTheme()).toBe("system");
  });
});

describe("applyResolvedTheme / getResolvedFromDom", () => {
  it("dark 给 <html> 加 class,light 去掉", () => {
    applyResolvedTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(getResolvedFromDom()).toBe("dark");

    applyResolvedTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(getResolvedFromDom()).toBe("light");
  });
});

describe("setTheme", () => {
  it("写入显式选择并更新 <html>", () => {
    setTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(getResolvedFromDom()).toBe("dark");
  });

  it("system 清除持久化,生效值取决于系统偏好", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    stubMatchMedia(false);
    setTheme("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(getResolvedFromDom()).toBe("light");
  });

  it("持久化失败(如隐私模式)不抛错,仍更新 <html>", () => {
    const spy = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => setTheme("dark")).not.toThrow();
    expect(getResolvedFromDom()).toBe("dark");
    spy.mockRestore();
  });
});

describe("subscribeTheme", () => {
  it("setTheme 通知订阅者,取消后不再通知", () => {
    const cb = vi.fn();
    const unsub = subscribeTheme(cb);
    setTheme("dark");
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    setTheme("light");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("跨标签 storage 事件触发同步与通知,无关 key 忽略", () => {
    const cb = vi.fn();
    const unsub = subscribeTheme(cb);

    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    window.dispatchEvent(
      new StorageEvent("storage", { key: THEME_STORAGE_KEY })
    );
    expect(getResolvedFromDom()).toBe("dark");
    expect(cb).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("system 模式下系统配色变化触发更新;已显式选择则忽略", () => {
    const { fire } = stubMatchMedia(true);
    const cb = vi.fn();
    const unsub = subscribeTheme(cb);

    // 未保存(system):系统转深色应生效。
    fire();
    expect(getResolvedFromDom()).toBe("dark");
    expect(cb).toHaveBeenCalled();

    // 已显式选 light:系统变化应被忽略。
    setTheme("light");
    cb.mockClear();
    fire();
    expect(getResolvedFromDom()).toBe("light");
    expect(cb).not.toHaveBeenCalled();
    unsub();
  });
});

describe("themeInitScript", () => {
  it("是自包含字符串且内联了 storage key", () => {
    expect(typeof themeInitScript).toBe("string");
    expect(themeInitScript).toContain(THEME_STORAGE_KEY);
    expect(themeInitScript).toContain("classList");
  });
});
