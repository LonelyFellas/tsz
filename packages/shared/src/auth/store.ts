import type { Role, User } from "@tsz/types";
import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface AuthState {
  user: User | null;
  /** 当前激活角色（来自 /me 的 active_role）。后台门禁据此判断 === 'admin'。 */
  activeRole: string | null;
  /** 是否已完成新用户引导。仅学员端有意义，后台忽略（恒 null）。 */
  onboarded: boolean | null;
  /** 身份已确认或明确无会话；临时恢复故障保持 false。 */
  hydrated: boolean;
  connectionError: boolean;
  /** 一次性发布已准备好的登录态，避免守卫读到 user/onboarded 的中间状态。 */
  setSession: (user: User, onboarded: boolean) => void;
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
    connectionError: false,
    setSession: (user, onboarded) =>
      set({
        user,
        onboarded,
        activeRole: user.active_role ?? null,
        hydrated: true,
        connectionError: false
      }),
    setUser: (user) => set({ user }),
    setActiveRole: (activeRole) => set({ activeRole }),
    setOnboarded: (onboarded) => set({ onboarded }),
    setHydrated: (hydrated) => set({ hydrated }),
    hasRole: (role) => !!get().user?.roles.includes(role)
  }));
}
