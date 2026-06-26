import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionRestore } from "./useSessionRestore";
import { useUserStore } from "@/stores/user";
import type { User } from "@tsz/types";

// ── 依赖 mock ─────────────────────────────────────────────────────────────────

vi.mock("@/lib/request", () => ({
  refreshTokens: vi.fn(),
  api: { auth: { me: vi.fn() } }
}));

import { refreshTokens, api } from "@/lib/request";
const mockRefreshTokens = vi.mocked(refreshTokens);
const mockMe = vi.mocked(api.auth.me);

const MOCK_USER: User = {
  id: "u1",
  phone: "13800138000",
  nickname: "Alice",
  roles: ["student"],
  coins: 0,
  createdAt: ""
};

// ── 工具 ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  useUserStore.setState({ user: null });
});

// ── 用例 ──────────────────────────────────────────────────────────────────────

describe("useSessionRestore", () => {
  it("refresh 成功 → 调 /me → 写入 user store", async () => {
    mockRefreshTokens.mockResolvedValueOnce("new-at");
    mockMe.mockResolvedValueOnce({ user: MOCK_USER, active_role: "student" });

    renderHook(() => useSessionRestore());

    await waitFor(() => {
      expect(useUserStore.getState().user).toEqual(MOCK_USER);
    });
    expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
    expect(mockMe).toHaveBeenCalledTimes(1);
  });

  it("refresh 失败（401）→ user store 保持 null，不跳转", async () => {
    mockRefreshTokens.mockRejectedValueOnce(new Error("invalid refresh token"));

    renderHook(() => useSessionRestore());

    // 等一个 tick 让 effect 跑完
    await waitFor(() => {
      expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
    });
    expect(mockMe).not.toHaveBeenCalled();
    expect(useUserStore.getState().user).toBeNull();
  });

  it("refresh 成功但 /me 失败 → user store 保持 null", async () => {
    mockRefreshTokens.mockResolvedValueOnce("new-at");
    mockMe.mockRejectedValueOnce(new Error("user not found"));

    renderHook(() => useSessionRestore());

    await waitFor(() => {
      expect(mockMe).toHaveBeenCalledTimes(1);
    });
    expect(useUserStore.getState().user).toBeNull();
  });

  it("只在挂载时执行一次，不重复调用", async () => {
    mockRefreshTokens.mockResolvedValue("new-at");
    mockMe.mockResolvedValue({ user: MOCK_USER, active_role: "student" });

    const { rerender } = renderHook(() => useSessionRestore());
    rerender();
    rerender();

    await waitFor(() => {
      expect(useUserStore.getState().user).toEqual(MOCK_USER);
    });
    expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
  });
});
