// 管理员的英语方言偏好（A1 · docs/features/dialect-preference-migration）。
//
// 这是**账号级个人设置**，只决定 admin 端的录入与展示口径，不是词条属性：
// 一条词条同时有英式 / 美式两种拼写是词典事实，由 wire 的 headwords 承载，
// 不因某个管理员偏好英式就消失。
//
// **事实源是服务端**（`GET /admin/profile` 的 `preferences.dialect`，
// 写入走 `PATCH /admin/profile/preferences`，后端 tsz-rust #35 / 提案 P2）。
// 本模块只剩两件事：把服务端值与本地缓存归并成「此刻按哪一侧」，
// 以及维护那份**离线缓存**——缓存永远不覆盖服务端值，丢了也不影响正确性。

import type { AdminDialectPreference } from "@tsz/types";

/** 英式 / 美式两态，无第三态。wire 类型的家在 `@tsz/types`，这里只转发。 */
export type { AdminDialectPreference } from "@tsz/types";

/**
 * **不是默认值**——默认值只由后端持有（从未设置过的管理员，profile 里就是 `uk`）。
 * 这个常量只在「服务端偏好还没到手、本地也没有缓存」的那一小段里当显示兜底，
 * 免得界面上出现空白的单选组。前端不得拿它当事实源，也不得据它写回服务端。
 */
export const FALLBACK_DIALECT_PREFERENCE: AdminDialectPreference = "uk";

/** 只取用到的两个方法，便于在 node 环境的单测里注入假存储。 */
export interface DialectPreferenceStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DialectPreferenceCache {
  /** 没缓存 / 值坏了 / 存储不可用一律返回 undefined，交由上层回落，绝不抛。 */
  read(adminProfileId: string): AdminDialectPreference | undefined;
  /** 写失败只警告不抛：事实源已经落在服务端，缓存丢了不影响正确性。 */
  write(adminProfileId: string, value: AdminDialectPreference): void;
}

const KEY_PREFIX = "tsz:admin:dialect-preference";
const SCHEMA_VERSION = 1;

/**
 * 按 schema 版本 + 管理员身份隔离缓存键：同一浏览器换账号登录时读到的是
 * 各自的值（读不到即交给服务端值兜底），因此**不需要**在登出时清理。
 */
export function dialectPreferenceStorageKey(adminProfileId: string): string {
  return `${KEY_PREFIX}:v${SCHEMA_VERSION}:${encodeURIComponent(adminProfileId)}`;
}

export function isAdminDialectPreference(
  value: unknown
): value is AdminDialectPreference {
  return value === "uk" || value === "us";
}

/**
 * 归并出「此刻按哪一侧」：服务端偏好 → 本地离线缓存 → 显示兜底。
 *
 * 服务端给了就一定用服务端的，缓存只在服务端值缺失时顶上——例如 profile 还没回来，
 * 或对着一个尚未部署 P2 的后端（响应里没有 `preferences`）。
 */
export function resolveDialectPreference(
  serverPreference: unknown,
  cachedPreference: AdminDialectPreference | undefined
): AdminDialectPreference {
  if (isAdminDialectPreference(serverPreference)) return serverPreference;
  return cachedPreference ?? FALLBACK_DIALECT_PREFERENCE;
}

export function createDialectPreferenceCache({
  storage,
  warn = () => {}
}: {
  storage?: DialectPreferenceStorageLike;
  warn?: (message: string, error?: unknown) => void;
} = {}): DialectPreferenceCache {
  return {
    read(adminProfileId) {
      if (!storage) return undefined;

      let raw: string | null;
      try {
        raw = storage.getItem(dialectPreferenceStorageKey(adminProfileId));
      } catch (error) {
        warn("[dialect preference] 无法读取离线缓存，改用服务端值", error);
        return undefined;
      }
      // 值不在枚举内（含缺失、被手工改坏）时当没缓存；不做清理——
      // 下一次写入自然覆盖，为此多开一个 removeItem 依赖不划算。
      return isAdminDialectPreference(raw) ? raw : undefined;
    },

    write(adminProfileId, value) {
      if (!storage) return;
      try {
        storage.setItem(dialectPreferenceStorageKey(adminProfileId), value);
      } catch (error) {
        // 缓存写失败不该冒泡到 UI：服务端那一次 PATCH 已经成功了，
        // 这里再报错等于把「保存成功」说成失败。
        warn("[dialect preference] 无法写入离线缓存，忽略", error);
      }
    }
  };
}
