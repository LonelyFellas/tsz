// 方言偏好在 admin 侧的薄壳：判定逻辑全在 @tsz/shared 的内核里，这里只负责
// ①绑定当前管理员身份 ②把偏好做成组件间共享的可订阅状态。
//
// 之所以不是各组件各自 useState：偏好是**跨屏读取**的——创建向导四步、只读预览、
// 语音发音人 locale 都要读同一个值，任何一处读到旧值都会让口径打架。
import { useCallback, useSyncExternalStore } from "react";
import {
  createDialectPreferenceStore,
  DEFAULT_DIALECT_PREFERENCE,
  type AdminDialectPreference
} from "@tsz/shared";
import { useAuthStore } from "@/lib/auth";

const store = createDialectPreferenceStore({
  storage: globalThis.localStorage,
  warn: (message, error) => {
    if (import.meta.env.DEV) console.warn(message, error);
  }
});

// 当前管理员的偏好快照。useSyncExternalStore 的 getSnapshot 必须同步且多次调用一致，
// 因此缓存下来，只在管理员身份变化或写入成功时失效。
let cached:
  { adminProfileId: string; value: AdminDialectPreference } | undefined;
const listeners = new Set<() => void>();

function snapshotOf(adminProfileId: string): AdminDialectPreference {
  if (cached?.adminProfileId !== adminProfileId) {
    cached = { adminProfileId, value: store.read(adminProfileId) };
  }
  return cached.value;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export interface DialectPreferenceHandle {
  preference: AdminDialectPreference;
  /** 保存失败时抛错；调用方负责提示，显示值因未更新而自动停在原值。 */
  savePreference: (value: AdminDialectPreference) => void;
}

export function useDialectPreference(): DialectPreferenceHandle {
  const adminProfileId = useAuthStore((s) => s.profile?.id);

  const getSnapshot = useCallback(
    () =>
      adminProfileId === undefined
        ? DEFAULT_DIALECT_PREFERENCE
        : snapshotOf(adminProfileId),
    [adminProfileId]
  );

  const savePreference = useCallback(
    (value: AdminDialectPreference) => {
      // 门禁保证受保护页内 profile 必有值；会话中途失效时兜底不写，
      // 避免把偏好落到一个无主的键上。
      if (adminProfileId === undefined) {
        throw new Error("方言偏好未能保存：当前会话已失效，请重新登录");
      }
      try {
        store.write(adminProfileId, value);
      } catch (error) {
        // 存储层的原始错误（QuotaExceeded / SecurityError 等）不适合直接给管理员看，
        // 换成可行动的说法，原因挂 cause 供排查。
        throw new Error(
          "方言偏好未能保存：浏览器本地存储不可写，请检查隐私设置",
          {
            cause: error
          }
        );
      }
      cached = { adminProfileId, value };
      for (const notify of listeners) notify();
    },
    [adminProfileId]
  );

  return {
    preference: useSyncExternalStore(subscribe, getSnapshot),
    savePreference
  };
}
