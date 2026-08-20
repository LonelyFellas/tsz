import { describe, expect, it, vi } from "vitest";
import {
  FALLBACK_DIALECT_PREFERENCE,
  createDialectPreferenceCache,
  dialectPreferenceStorageKey,
  isAdminDialectPreference,
  resolveDialectPreference,
  type DialectPreferenceStorageLike
} from "./dialect-preference";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value)
  } satisfies DialectPreferenceStorageLike & { map: Map<string, string> };
}

describe("dialectPreferenceStorageKey", () => {
  it("按 schema 版本与管理员身份隔离", () => {
    expect(dialectPreferenceStorageKey("admin-1")).toBe(
      "tsz:admin:dialect-preference:v1:admin-1"
    );
    expect(dialectPreferenceStorageKey("admin-1")).not.toBe(
      dialectPreferenceStorageKey("admin-2")
    );
  });

  it("转义身份中的特殊字符，避免拼出歧义键", () => {
    expect(dialectPreferenceStorageKey("a:b c")).toBe(
      "tsz:admin:dialect-preference:v1:a%3Ab%20c"
    );
  });
});

describe("isAdminDialectPreference", () => {
  it("只接受 uk / us", () => {
    expect(isAdminDialectPreference("uk")).toBe(true);
    expect(isAdminDialectPreference("us")).toBe(true);
    expect(isAdminDialectPreference("common")).toBe(false);
    expect(isAdminDialectPreference(null)).toBe(false);
    expect(isAdminDialectPreference(undefined)).toBe(false);
  });
});

describe("resolveDialectPreference", () => {
  it("服务端给了就用服务端的，缓存不参与", () => {
    expect(resolveDialectPreference("us", "uk")).toBe("us");
    expect(resolveDialectPreference("uk", "us")).toBe("uk");
  });

  it("服务端值缺失或不在枚举内时退回本地缓存", () => {
    expect(resolveDialectPreference(undefined, "us")).toBe("us");
    expect(resolveDialectPreference("australian", "us")).toBe("us");
    expect(resolveDialectPreference(null, "uk")).toBe("uk");
  });

  it("两边都没有时才用显示兜底值", () => {
    expect(resolveDialectPreference(undefined, undefined)).toBe(
      FALLBACK_DIALECT_PREFERENCE
    );
    expect(FALLBACK_DIALECT_PREFERENCE).toBe("uk");
  });
});

describe("createDialectPreferenceCache#read", () => {
  it("没有存储时返回 undefined，交给上层回落", () => {
    expect(createDialectPreferenceCache().read("admin-1")).toBeUndefined();
  });

  it("未缓存过时返回 undefined", () => {
    const cache = createDialectPreferenceCache({ storage: fakeStorage() });
    expect(cache.read("admin-1")).toBeUndefined();
  });

  it("读回已缓存的值", () => {
    const storage = fakeStorage({
      [dialectPreferenceStorageKey("admin-1")]: "us"
    });
    expect(createDialectPreferenceCache({ storage }).read("admin-1")).toBe(
      "us"
    );
  });

  it("不串号：只读当前管理员自己的键", () => {
    const storage = fakeStorage({
      [dialectPreferenceStorageKey("admin-1")]: "us"
    });
    const cache = createDialectPreferenceCache({ storage });
    expect(cache.read("admin-1")).toBe("us");
    expect(cache.read("admin-2")).toBeUndefined();
  });

  it("值被改坏时当没缓存，不抛", () => {
    const storage = fakeStorage({
      [dialectPreferenceStorageKey("admin-1")]: "australian"
    });
    expect(
      createDialectPreferenceCache({ storage }).read("admin-1")
    ).toBeUndefined();
  });

  it("存储读取抛错时返回 undefined 并 warn", () => {
    const failure = new Error("SecurityError");
    const warn = vi.fn();
    const cache = createDialectPreferenceCache({
      storage: {
        getItem: () => {
          throw failure;
        },
        setItem: () => {}
      },
      warn
    });

    expect(cache.read("admin-1")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("无法读取"),
      failure
    );
  });

  it("未注入 warn 时读取失败也不抛", () => {
    const cache = createDialectPreferenceCache({
      storage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {}
      }
    });

    expect(cache.read("admin-1")).toBeUndefined();
  });
});

describe("createDialectPreferenceCache#write", () => {
  it("写入按管理员隔离的键", () => {
    const storage = fakeStorage();
    createDialectPreferenceCache({ storage }).write("admin-1", "us");

    expect(storage.map.get(dialectPreferenceStorageKey("admin-1"))).toBe("us");
  });

  it("写入后可被读回", () => {
    const storage = fakeStorage();
    const cache = createDialectPreferenceCache({ storage });
    cache.write("admin-1", "us");

    expect(cache.read("admin-1")).toBe("us");
  });

  it("没有存储时静默跳过：事实源在服务端，缓存不是必需品", () => {
    expect(() =>
      createDialectPreferenceCache().write("admin-1", "us")
    ).not.toThrow();
  });

  it("存储写入抛错时只 warn 不抛，免得把已成功的保存报成失败", () => {
    const failure = new Error("QuotaExceededError");
    const warn = vi.fn();
    const cache = createDialectPreferenceCache({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw failure;
        }
      },
      warn
    });

    expect(() => cache.write("admin-1", "us")).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("无法写入"),
      failure
    );
  });

  it("未注入 warn 时写入失败也不抛", () => {
    const cache = createDialectPreferenceCache({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        }
      }
    });

    expect(() => cache.write("admin-1", "us")).not.toThrow();
  });
});
