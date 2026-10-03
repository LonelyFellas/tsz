import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "./useLogout";
import { authRuntime } from "@/lib/auth";

const mockAssign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "window",
    new Proxy(window, {
      get(target, key) {
        return key === "location"
          ? { ...target.location, assign: mockAssign }
          : Reflect.get(target, key, target);
      }
    })
  );
  authRuntime.tokens.setAccessToken("token");
  authRuntime.store.setState({
    user: {
      id: "1",
      display_name: "User",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    },
    activeRole: "student",
    onboarded: true,
    hydrated: false,
    connectionError: true
  });
});
afterEach(() => {
  authRuntime.clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useLogout + runtime + HTTP", () => {
  it.each(["success", "offline"])(
    "logout %s 都清完整会话，再跳登录页",
    async (outcome) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      if (outcome === "success")
        fetch.mockResolvedValue(new Response(null, { status: 204 }));
      else fetch.mockRejectedValue(new TypeError("network error"));
      mockAssign.mockImplementation(() => {
        expect(authRuntime.tokens.getToken()).toBeUndefined();
        expect(authRuntime.store.getState()).toMatchObject({
          user: null,
          activeRole: null,
          onboarded: null,
          hydrated: true,
          connectionError: false
        });
      });
      const { result } = renderHook(() => useLogout());
      await act(async () => {
        await expect(result.current()).resolves.toBeUndefined();
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockAssign).toHaveBeenCalledWith("/login");
    }
  );
});
