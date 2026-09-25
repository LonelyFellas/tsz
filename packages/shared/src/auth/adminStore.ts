import type { AdminLevel, AdminProfile } from "@tsz/types";
import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface AdminAuthState {
  /** 登录管理员自身身份（含 role）。null = 未登录。门禁据此判定。 */
  profile: AdminProfile | null;
  /** 身份等级（wire 字段名 role，Q11），单列出来驱动菜单（super_admin 才显示管理员管理入口）。 */
  role: AdminLevel | null;
  /** 身份已确认或明确无会话；临时恢复故障保持 false。 */
  hydrated: boolean;
  connectionError: boolean;
  setProfile: (profile: AdminProfile | null) => void;
  setHydrated: (hydrated: boolean) => void;
}

export type AdminAuthStore = UseBoundStore<StoreApi<AdminAuthState>>;

/**
 * 后台用户态 store（与 web 端 createAuthStore 完全独立）。每个 admin 应用实例化一次。
 * 会话由 useAdminSessionRestore 通过 admin refresh cookie 静默恢复后写入。
 * role 始终与 profile 同步派生，避免两者不一致。
 */
export function createAdminAuthStore(): AdminAuthStore {
  return create<AdminAuthState>((set) => ({
    profile: null,
    role: null,
    hydrated: false,
    connectionError: false,
    setProfile: (profile) =>
      set({
        profile,
        role: profile?.role ?? null,
        ...(profile ? { hydrated: true, connectionError: false } : {})
      }),
    setHydrated: (hydrated) => set({ hydrated })
  }));
}
