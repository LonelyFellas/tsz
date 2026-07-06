import type { AdminLevel, AdminProfile } from "@tsz/types";
import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface AdminAuthState {
  /** 登录管理员自身身份（含 level）。null = 未登录。门禁据此判定。 */
  profile: AdminProfile | null;
  /** 权限等级，单列出来驱动菜单（super_admin 才显示管理员管理入口）。 */
  level: AdminLevel | null;
  /** 会话恢复是否已尝试完成（成功或失败）。用于区分「恢复中」与「确未登录」，避免登录态闪烁。 */
  hydrated: boolean;
  setProfile: (profile: AdminProfile | null) => void;
  setHydrated: (hydrated: boolean) => void;
}

export type AdminAuthStore = UseBoundStore<StoreApi<AdminAuthState>>;

/**
 * 后台用户态 store（与 web 端 createAuthStore 完全独立）。每个 admin 应用实例化一次。
 * 会话由 useAdminSessionRestore 通过 admin refresh cookie 静默恢复后写入。
 * level 始终与 profile 同步派生，避免两者不一致。
 */
export function createAdminAuthStore(): AdminAuthStore {
  return create<AdminAuthState>((set) => ({
    profile: null,
    level: null,
    hydrated: false,
    setProfile: (profile) => set({ profile, level: profile?.level ?? null }),
    setHydrated: (hydrated) => set({ hydrated })
  }));
}
