import { describe, expect, it, vi } from "vitest";
import {
  adminWordsMockStorageKey,
  createAdminWordsMockStorage,
  type AdminWordsMockStorageLike
} from "./storage";

interface TestState {
  words: string[];
}

function createMemoryStorage(): AdminWordsMockStorageLike & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key)
  };
}

const isState = (value: unknown): value is TestState =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as TestState).words) &&
  (value as TestState).words.every((word) => typeof word === "string");

describe("admin words mock storage", () => {
  it("按 schema 与管理员 ID 隔离并可跨实例恢复", () => {
    const storage = createMemoryStorage();
    const first = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      isState
    });
    first.save("admin/a", { words: ["centre"] });

    const second = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      isState
    });
    expect(second.load("admin/a")).toEqual({ words: ["centre"] });
    expect(storage.values.has(adminWordsMockStorageKey(2, "admin/a"))).toBe(
      true
    );
  });

  it("把已校验的旧 schema 数据迁移到当前 namespace 并清理旧 key", () => {
    const storage = createMemoryStorage();
    const legacyKey = adminWordsMockStorageKey(1, "admin-a");
    const currentKey = adminWordsMockStorageKey(2, "admin-a");
    storage.values.set(
      legacyKey,
      JSON.stringify({
        schema_version: 1,
        admin_profile_id: "admin-a",
        state: { words: ["centre"] }
      })
    );
    const migrateLegacy = vi.fn((state: unknown) =>
      isState(state)
        ? { words: state.words.map((word) => `${word}-migrated`) }
        : undefined
    );
    const adapter = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      legacySchemaVersions: [1],
      isState,
      migrateLegacy
    });

    expect(adapter.load("admin-a")).toEqual({ words: ["centre-migrated"] });
    expect(migrateLegacy).toHaveBeenCalledWith({ words: ["centre"] }, 1);
    expect(storage.values.has(legacyKey)).toBe(false);
    expect(storage.values.has(currentKey)).toBe(true);
  });

  it("管理员切换时清理上一身份 namespace", () => {
    const storage = createMemoryStorage();
    const adapter = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      isState
    });
    adapter.save("admin-a", { words: ["one"] });
    adapter.save("admin-b", { words: ["two"] });

    expect(storage.values.has(adminWordsMockStorageKey(2, "admin-a"))).toBe(
      false
    );
    expect(adapter.load("admin-b")).toEqual({ words: ["two"] });
  });

  it.each([
    "not-json",
    JSON.stringify("scalar"),
    JSON.stringify([]),
    JSON.stringify({
      schema_version: 1,
      admin_profile_id: "admin-a",
      state: { words: [] }
    }),
    JSON.stringify({
      schema_version: 2,
      admin_profile_id: "other",
      state: { words: [] }
    }),
    JSON.stringify({
      schema_version: 2,
      admin_profile_id: "admin-a",
      state: { words: [1] }
    })
  ])("损坏或不兼容数据 fail closed 并清理: %s", (raw) => {
    const storage = createMemoryStorage();
    const warn = vi.fn();
    const key = adminWordsMockStorageKey(2, "admin-a");
    storage.values.set(key, raw);
    const adapter = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      isState,
      warn
    });

    expect(adapter.load("admin-a")).toBeUndefined();
    expect(storage.values.has(key)).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("已清理"),
      expect.anything()
    );
  });

  it("无浏览器 storage 时所有操作安全降级", () => {
    const adapter = createAdminWordsMockStorage({
      schemaVersion: 2,
      isState
    });

    expect(adapter.load("admin-a")).toBeUndefined();
    expect(() => adapter.save("admin-a", { words: ["one"] })).not.toThrow();
    expect(() => adapter.clear("admin-a")).not.toThrow();
    expect(() => adapter.clear()).not.toThrow();
  });

  it("get/set/remove 抛错时分别告警并继续使用内存状态", () => {
    const warn = vi.fn();
    const failure = new Error("storage unavailable");
    const storage: AdminWordsMockStorageLike = {
      getItem: () => {
        throw failure;
      },
      setItem: () => {
        throw failure;
      },
      removeItem: () => {
        throw failure;
      }
    };
    const adapter = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      isState,
      warn
    });

    expect(adapter.load("admin-a")).toBeUndefined();
    adapter.save("admin-a", { words: ["one"] });
    adapter.clear("admin-a");
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining("无法读取"),
      expect.stringContaining("无法写入"),
      expect.stringContaining("无法清理")
    ]);
  });

  it("空 namespace 与显式清理非当前 profile 不影响当前状态", () => {
    const storage = createMemoryStorage();
    const adapter = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      isState
    });
    expect(adapter.load("missing")).toBeUndefined();
    adapter.save("admin-a", { words: ["one"] });
    adapter.clear("admin-b");
    expect(adapter.load("admin-a")).toEqual({ words: ["one"] });
    adapter.clear();
    expect(storage.values.has(adminWordsMockStorageKey(2, "admin-a"))).toBe(
      false
    );
  });

  it("默认开发态 warning 会报告损坏数据", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createMemoryStorage();
    storage.values.set(adminWordsMockStorageKey(2, "admin-a"), "bad-json");
    const adapter = createAdminWordsMockStorage({
      storage,
      schemaVersion: 2,
      isState
    });

    expect(adapter.load("admin-a")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("已清理"),
      expect.anything()
    );
    consoleWarn.mockRestore();
  });
});
