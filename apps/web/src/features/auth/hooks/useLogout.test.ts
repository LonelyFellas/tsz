import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "./useLogout";
import { useUserStore } from "@/stores/user";

// ── 依赖 mock ─────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: { auth: { logout: vi.fn() } }
}));

import { api, setAccessToken } from "@/lib/request";
const mockLogout = vi.mocked(api.auth.logout);
const mockSetAccessToken = vi.mocked(setAccessToken);

// ── 工具 ──────────────────────────────────────────────────────────────────────

function renderLogout() {
  const { result } = renderHook(() => useLogout());
  return result.current; // logout 函数
}

beforeEach(() => {
  vi.clearAllMocks();
  // 重置 user store
  useUserStore.setState({ user: { id: "1" } as never });
});

// ── 用例 ──────────────────────────────────────────────────────────────────────

describe("useLogout", () => {
  it("logout 成功：清除 token、清除 user store、跳转 /login", async () => {
    mockLogout.mockResolvedValueOnce(undefined);

    const logout = renderLogout();
    await act(async () => {
      await logout();
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    expect(useUserStore.getState().user).toBeNull();
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("logout API 失败：吞掉错误（始终 resolve），本地状态仍清除并跳转 /login", async () => {
    mockLogout.mockRejectedValueOnce(new Error("network error"));

    const logout = renderLogout();
    // 新契约：logout() 始终 resolve，调用方无需 catch。
    await act(async () => {
      await expect(logout()).resolves.toBeUndefined();
    });

    // 即使后端报错，本地必须清干净
    expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    expect(useUserStore.getState().user).toBeNull();
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("清除顺序：先清 token 和 user，再跳转", async () => {
    const callOrder: string[] = [];
    mockLogout.mockResolvedValueOnce(undefined);
    mockSetAccessToken.mockImplementation(() => {
      callOrder.push("setAccessToken");
    });
    mockPush.mockImplementation(() => {
      callOrder.push("push");
    });
    useUserStore.subscribe(() => {
      if (useUserStore.getState().user === null) callOrder.push("clearUser");
    });

    const logout = renderLogout();
    await act(async () => {
      await logout();
    });

    expect(callOrder).toEqual(["setAccessToken", "clearUser", "push"]);
  });
});
