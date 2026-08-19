// 管理员的英语方言偏好（A1 · docs/features/dialect-preference-migration）。
//
// 这是**账号级个人设置**，只决定 admin 端的录入与展示口径，不是词条属性：
// 一条词条同时有英式 / 美式两种拼写是词典事实，由 wire 的 headwords 承载，
// 不因某个管理员偏好英式就消失。
//
// 当前落在浏览器本地存储，是后端 profile 持久化（提案 P2）落地前的过渡形态；
// 届时事实源改为服务端，本模块降级为离线缓存。

/** 英式 / 美式两态，无第三态。 */
export type AdminDialectPreference = "uk" | "us";

/** 从未设置过的管理员一律按英式解释。 */
export const DEFAULT_DIALECT_PREFERENCE: AdminDialectPreference = "uk";

/** 只取用到的两个方法，便于在 node 环境的单测里注入假存储。 */
export interface DialectPreferenceStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DialectPreferenceStore {
  /** 读不到、读坏或存储不可用一律回落默认值，绝不抛——偏好读失败不该阻断任何页面。 */
  read(adminProfileId: string): AdminDialectPreference;
  /** 写失败抛错，由调用方提示并回退显示值；不能让 UI 假装保存成功。 */
  write(adminProfileId: string, value: AdminDialectPreference): void;
}

const KEY_PREFIX = "tsz:admin:dialect-preference";
const SCHEMA_VERSION = 1;

/**
 * 按 schema 版本 + 管理员身份隔离存储键：同一浏览器换账号登录时读到的是
 * 各自的值（读不到即默认英式），因此**不需要**在登出时清理——
 * 清理反而会让偏好每次登出都丢失，与「下次登录仍是我选的那个」相悖。
 */
export function dialectPreferenceStorageKey(adminProfileId: string): string {
  return `${KEY_PREFIX}:v${SCHEMA_VERSION}:${encodeURIComponent(adminProfileId)}`;
}

export function isAdminDialectPreference(
  value: unknown
): value is AdminDialectPreference {
  return value === "uk" || value === "us";
}

export function createDialectPreferenceStore({
  storage,
  warn = () => {}
}: {
  storage?: DialectPreferenceStorageLike;
  warn?: (message: string, error?: unknown) => void;
} = {}): DialectPreferenceStore {
  return {
    read(adminProfileId) {
      if (!storage) return DEFAULT_DIALECT_PREFERENCE;

      let raw: string | null;
      try {
        raw = storage.getItem(dialectPreferenceStorageKey(adminProfileId));
      } catch (error) {
        warn("[dialect preference] 无法读取本地存储，按默认方言处理", error);
        return DEFAULT_DIALECT_PREFERENCE;
      }
      // 值不在枚举内（含缺失、被手工改坏）时回落默认；不做清理——
      // 下一次写入自然覆盖，为此多开一个 removeItem 依赖不划算。
      return isAdminDialectPreference(raw) ? raw : DEFAULT_DIALECT_PREFERENCE;
    },

    write(adminProfileId, value) {
      if (!storage) {
        throw new Error("方言偏好未能保存：当前浏览器不支持本地存储");
      }
      storage.setItem(dialectPreferenceStorageKey(adminProfileId), value);
    }
  };
}
