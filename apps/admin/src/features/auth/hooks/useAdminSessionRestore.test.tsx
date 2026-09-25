import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSessionRestore } from "./useAdminSessionRestore";
import { authRuntime } from "@/lib/auth";

const profile = {
  id: "a1",
  phone: "13800138000",
  display_name: "Administrator",
  role: "super_admin",
  can_publish_lexicon: true,
  permissions: [],
  preferences: { dialect: "uk" }
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  authRuntime.tokens.setAccessToken(null);
  authRuntime.store.setState({
    profile: null,
    role: null,
    hydrated: false,
    connectionError: false
  });
});
afterEach(() => {
  authRuntime.tokens.setAccessToken(null);
  vi.restoreAllMocks();
});

describe("useAdminSessionRestore + runtime + HTTP", () => {
  it.each([503, "offline"])(
    "refresh %s 不判未登录，重试后恢复",
    async (failure) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      if (failure === 503) fetch.mockResolvedValueOnce(json({}, 503));
      else fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const { result, rerender } = renderHook(() => useAdminSessionRestore());
      await waitFor(() =>
        expect(authRuntime.store.getState().connectionError).toBe(true)
      );
      expect(authRuntime.store.getState()).toMatchObject({
        hydrated: false,
        profile: null
      });
      rerender();
      expect(fetch).toHaveBeenCalledTimes(1);
      fetch
        .mockResolvedValueOnce(json({ access_token: "new", expires_in: 900 }))
        .mockResolvedValueOnce(json(profile));
      await act(() => result.current.retry());
      expect(authRuntime.store.getState()).toMatchObject({
        profile,
        hydrated: true,
        connectionError: false
      });
      expect(fetch).toHaveBeenCalledTimes(3);
    }
  );

  it("恢复临时失败后正常登录，确认 profile 才结束恢复状态", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({}, 503));
    renderHook(() => useAdminSessionRestore());
    await waitFor(() =>
      expect(authRuntime.store.getState().connectionError).toBe(true)
    );
    fetch
      .mockResolvedValueOnce(
        json({
          access_token: "login",
          expires_in: 900,
          must_change_password: false
        })
      )
      .mockResolvedValueOnce(json(profile));
    await act(async () => {
      const auth = await authRuntime.api.auth.login(
        "13800138000",
        "test-password",
        "000000"
      );
      authRuntime.persistSession(auth);
      expect(authRuntime.store.getState().hydrated).toBe(false);
      authRuntime.store.getState().setProfile(await authRuntime.api.profile());
    });
    expect(authRuntime.store.getState()).toMatchObject({
      hydrated: true,
      profile,
      connectionError: false
    });
  });

  it("明确 refresh 401 才标记未登录", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({}, 401));
    renderHook(() => useAdminSessionRestore());
    await waitFor(() =>
      expect(authRuntime.store.getState().hydrated).toBe(true)
    );
    expect(authRuntime.store.getState().profile).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("profile 503 不放行身份，online 后只重试 profile", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ access_token: "new", expires_in: 900 }))
      .mockResolvedValueOnce(json({}, 503));
    renderHook(() => useAdminSessionRestore());
    await waitFor(() =>
      expect(authRuntime.store.getState().connectionError).toBe(true)
    );
    expect(authRuntime.store.getState()).toMatchObject({
      hydrated: false,
      profile: null
    });
    fetch.mockResolvedValueOnce(json(profile));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(authRuntime.store.getState().hydrated).toBe(true)
    );
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))
    ).toHaveLength(1);
    expect(authRuntime.store.getState().profile).toEqual(profile);
  });
});
