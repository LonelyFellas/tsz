"use client";

import type { Role, User } from "@tsz/types";
import { create } from "zustand";

interface UserState {
  user: User | null;
  /** 是否已完成新用户引导（选择难度等级 + 英式/美式）。null 表示尚未从 /me 获取。 */
  onboarded: boolean | null;
  /** 会话恢复是否已尝试完成（成功或失败）。用于区分「恢复中」与「确未登录」，避免登录态闪烁。 */
  hydrated: boolean;
  setUser: (user: User | null) => void;
  setOnboarded: (onboarded: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  hasRole: (role: Role) => boolean;
}

// 客户端当前用户态。会话由 useSessionRestore 通过 refresh cookie 静默恢复后写入。
export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  onboarded: null,
  hydrated: false,
  setUser: (user) => set({ user }),
  setOnboarded: (onboarded) => set({ onboarded }),
  setHydrated: (hydrated) => set({ hydrated }),
  hasRole: (role) => !!get().user?.roles.includes(role)
}));
