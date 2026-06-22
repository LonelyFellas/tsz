"use client";

import type { Role, User } from "@tsz/types";
import { create } from "zustand";

interface UserState {
  user: User | null;
  setUser: (user: User | null) => void;
  hasRole: (role: Role) => boolean;
}

// 客户端当前用户态。SSR 首屏由 getSession 提供,客户端交互用此 store。
export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  hasRole: (role) => !!get().user?.roles.includes(role)
}));
