import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthRuntime } = await import("@tsz/shared/auth");
  const authRuntime = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
  return {
    authRuntime,
    ...authRuntime,
    useAuthStore: authRuntime.store
  };
});

import { createAdminAuthRuntime } from "@tsz/shared/auth";
import { authRuntime, api } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";

const profile = {
  id: "admin-a",
  phone: "13800138000",
  display_name: "管理员 A",
  role: "admin" as const,
  permission_version: 1,
  catalog_version: "v1",
  permissions: [],
  preferences: { dialect: "uk" as const }
};

afterEach(() => {
  authRuntime.tokens.setAccessToken(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
});

it("后台退出请求失败后，重建页面不能通过残留 Cookie 自动恢复登录", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("location", {
    replace: vi.fn(),
    pathname: "/settings/profile"
  });
  authRuntime.persistSession({ access_token: "admin-old", expires_in: 900 });
  authRuntime.store.getState().setProfile(profile);
  vi.spyOn(api.auth, "logout").mockRejectedValue(new TypeError("offline"));
  const { result } = renderHook(() => useAdminLogout());

  await act(() => result.current());

  expect(authRuntime.tokens.getToken()).toBeUndefined();
  expect(authRuntime.store.getState().profile).toBeNull();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "cookie-still-valid", expires_in: 900 })
      )
    );
  const reloaded = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
  vi.spyOn(reloaded.api, "profile").mockResolvedValue(profile);
  try {
    await reloaded.restoreSession();
    expect(fetch).not.toHaveBeenCalled();
    expect(reloaded.store.getState()).toMatchObject({
      profile: null,
      hydrated: true
    });
  } finally {
    reloaded.tokens.setAccessToken(null);
  }
});
