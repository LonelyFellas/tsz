import type { AdminProfile } from "@tsz/api-client";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 用真实 admin store 驱动状态断言，api/tokens 受控 mock。
vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: { profile: vi.fn() },
    tokens: { refreshTokens: vi.fn() }
  };
});

import { useAdminSessionRestore } from "./useAdminSessionRestore";
import { api, tokens, useAuthStore } from "@/lib/auth";

const mockRefresh = vi.mocked(tokens.refreshTokens);
const mockProfile = vi.mocked(api.profile);

const PROFILE: AdminProfile = {
  id: "a1",
  phone: "13800138000",
  display_name: "Administrator",
  level: "super_admin",
  permissions: []
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ profile: null, level: null, hydrated: false });
});

describe("useAdminSessionRestore", () => {
  it("refresh 成功 → 探 /admin/profile → 写入 profile + hydrated", async () => {
    mockRefresh.mockResolvedValueOnce("new-at");
    mockProfile.mockResolvedValueOnce(PROFILE);

    renderHook(() => useAdminSessionRestore());

    await waitFor(() => {
      expect(useAuthStore.getState().profile).toEqual(PROFILE);
    });
    expect(useAuthStore.getState().level).toBe("super_admin");
    expect(useAuthStore.getState().hydrated).toBe(true);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockProfile).toHaveBeenCalledTimes(1);
  });

  it("refresh 失败 → profile 保持 null，仍标记 hydrated", async () => {
    mockRefresh.mockRejectedValueOnce(new Error("invalid refresh token"));

    renderHook(() => useAdminSessionRestore());

    await waitFor(() => {
      expect(useAuthStore.getState().hydrated).toBe(true);
    });
    expect(mockProfile).not.toHaveBeenCalled();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("refresh 成功但 profile 失败 → profile 保持 null", async () => {
    mockRefresh.mockResolvedValueOnce("new-at");
    mockProfile.mockRejectedValueOnce(new Error("session expired"));

    renderHook(() => useAdminSessionRestore());

    await waitFor(() => {
      expect(mockProfile).toHaveBeenCalledTimes(1);
    });
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("只在挂载时执行一次", async () => {
    mockRefresh.mockResolvedValue("new-at");
    mockProfile.mockResolvedValue(PROFILE);

    const { rerender } = renderHook(() => useAdminSessionRestore());
    rerender();
    rerender();

    await waitFor(() => {
      expect(useAuthStore.getState().profile).toEqual(PROFILE);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
