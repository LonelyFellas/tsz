"use client";

// 客户端当前用户态。store 内核来自 @tsz/shared/auth（与 admin 共用），
// 含 user / onboarded / hydrated / activeRole 等字段。
// 会话由 useSessionRestore 通过 refresh cookie 静默恢复后写入。
import { authRuntime } from "@/lib/auth";

export const useUserStore = authRuntime.store;
