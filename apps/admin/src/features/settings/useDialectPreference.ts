// 方言偏好在 admin 侧的薄壳：判定逻辑全在 @tsz/shared 的内核里，这里只负责
// ①从 profile 取服务端偏好 ②写入时调后端并把落库值回填 store ③维护离线缓存。
//
// 之所以不再自建共享状态：偏好是**跨屏读取**的（创建向导四步、只读预览、语音发音人
// locale 都要读同一个值），而 profile 本身就在 auth store 里——把偏好挂在 profile 上，
// 一次 setProfile 就让所有订阅者同步，比再维护一份模块级快照少一处会漂移的真相。
import { useCallback, useMemo } from "react";
import {
  createDialectPreferenceCache,
  resolveDialectPreference,
  type AdminDialectPreference
} from "@tsz/shared";
import { api, useAuthStore } from "@/lib/auth";

const cache = createDialectPreferenceCache({
  storage: globalThis.localStorage,
  warn: (message, error) => {
    if (import.meta.env.DEV) console.warn(message, error);
  }
});

export interface DialectPreferenceHandle {
  preference: AdminDialectPreference;
  /** 保存失败时抛错；调用方负责提示，显示值因 profile 未更新而自动停在原值。 */
  savePreference: (value: AdminDialectPreference) => Promise<void>;
}

export function useDialectPreference(): DialectPreferenceHandle {
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const adminProfileId = profile?.id;
  const serverPreference = profile?.preferences?.dialect;

  const preference = useMemo(
    () =>
      resolveDialectPreference(
        serverPreference,
        adminProfileId === undefined ? undefined : cache.read(adminProfileId)
      ),
    [adminProfileId, serverPreference]
  );

  const savePreference = useCallback(
    async (value: AdminDialectPreference) => {
      // 门禁保证受保护页内 profile 必有值；会话中途失效时兜底不写，
      // 避免拿一个无主身份去改别人的偏好。
      if (!profile) {
        throw new Error("当前会话已失效，请重新登录");
      }
      const { preferences } = await api.updateProfilePreferences({
        dialect: value
      });
      // 回填的是**服务端落库后的值**而不是我们提交的值：默认值与取值都由后端说了算。
      setProfile({ ...profile, preferences });
      cache.write(profile.id, preferences.dialect);
    },
    [profile, setProfile]
  );

  return { preference, savePreference };
}
