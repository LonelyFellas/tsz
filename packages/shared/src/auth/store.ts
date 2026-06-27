import type { Role, User } from "@tsz/types";
import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface AuthState {
  user: User | null;
  /** 当前激活角色（来自 /me 的 active_role）。后台门禁据此判断 === 'admin'。 */
  activeRole: string | null;
  /** 是否已完成新用户引导。仅学员端有意义，后台忽略（恒 null）。 */
  onboarded: boolean | null;
  /** 会话恢复是否已尝试完成（成功或失败）。用于区分「恢复中」与「确未登录」，避免登录态闪烁。 */
  hydrated: boolean;
  setUser: (user: User | null) => void;
  setActiveRole: (role: string | null) => void;
  setOnboarded: (onboarded: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  hasRole: (role: Role) => boolean;
}

export type AuthStore = UseBoundStore<StoreApi<AuthState>>;

/**
 * 创建一枚客户端用户态 store。每个应用实例化一次（web / admin 各持一份）。
 * 会话由 useSessionRestore 通过 refresh cookie 静默恢复后写入。
 */
export function createAuthStore(): AuthStore {
  return create<AuthState>((set, get) => ({
    user: null,
    activeRole: null,
    onboarded: null,
    hydrated: false,
    setUser: (user) => set({ user }),
    setActiveRole: (activeRole) => set({ activeRole }),
    setOnboarded: (onboarded) => set({ onboarded }),
    setHydrated: (hydrated) => set({ hydrated }),
    hasRole: (role) => !!get().user?.roles.includes(role)
  }));
}
