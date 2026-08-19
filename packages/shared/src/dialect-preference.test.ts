import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DIALECT_PREFERENCE,
  createDialectPreferenceStore,
  dialectPreferenceStorageKey,
  isAdminDialectPreference,
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

describe("createDialectPreferenceStore#read", () => {
  it("没有存储时返回默认英式", () => {
    expect(createDialectPreferenceStore().read("admin-1")).toBe(
      DEFAULT_DIALECT_PREFERENCE
    );
    expect(DEFAULT_DIALECT_PREFERENCE).toBe("uk");
  });

  it("未设置过时返回默认英式", () => {
    const store = createDialectPreferenceStore({ storage: fakeStorage() });
    expect(store.read("admin-1")).toBe("uk");
  });

  it("读回已保存的值", () => {
    const storage = fakeStorage({
      [dialectPreferenceStorageKey("admin-1")]: "us"
    });
    expect(createDialectPreferenceStore({ storage }).read("admin-1")).toBe(
      "us"
    );
  });

  it("不串号：只读当前管理员自己的键", () => {
    const storage = fakeStorage({
      [dialectPreferenceStorageKey("admin-1")]: "us"
    });
    const store = createDialectPreferenceStore({ storage });
    expect(store.read("admin-1")).toBe("us");
    expect(store.read("admin-2")).toBe("uk");
  });

  it("值被改坏时回落默认，不抛", () => {
    const storage = fakeStorage({
      [dialectPreferenceStorageKey("admin-1")]: "australian"
    });
    expect(createDialectPreferenceStore({ storage }).read("admin-1")).toBe(
      "uk"
    );
  });

  it("存储读取抛错时回落默认并 warn", () => {
    const failure = new Error("SecurityError");
    const warn = vi.fn();
    const store = createDialectPreferenceStore({
      storage: {
        getItem: () => {
          throw failure;
        },
        setItem: () => {}
      },
      warn
    });

    expect(store.read("admin-1")).toBe("uk");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("无法读取"),
      failure
    );
  });

  it("未注入 warn 时读取失败也不抛", () => {
    const store = createDialectPreferenceStore({
      storage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {}
      }
    });

    expect(store.read("admin-1")).toBe("uk");
  });
});

describe("createDialectPreferenceStore#write", () => {
  it("写入按管理员隔离的键", () => {
    const storage = fakeStorage();
    createDialectPreferenceStore({ storage }).write("admin-1", "us");

    expect(storage.map.get(dialectPreferenceStorageKey("admin-1"))).toBe("us");
  });

  it("写入后可被读回", () => {
    const storage = fakeStorage();
    const store = createDialectPreferenceStore({ storage });
    store.write("admin-1", "us");

    expect(store.read("admin-1")).toBe("us");
  });

  it("没有存储时抛错，不能假装保存成功", () => {
    expect(() => createDialectPreferenceStore().write("admin-1", "us")).toThrow(
      /未能保存/
    );
  });

  it("存储写入抛错时向上抛出，由调用方提示", () => {
    const failure = new Error("QuotaExceededError");
    const store = createDialectPreferenceStore({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw failure;
        }
      }
    });

    expect(() => store.write("admin-1", "us")).toThrow(failure);
  });
});
