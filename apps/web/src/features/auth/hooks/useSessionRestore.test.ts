import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionRestore } from "./useSessionRestore";
import { authRuntime } from "@/lib/auth";

const user = {
  id: "u1",
  display_name: "Alice",
  roles: ["student"],
  avatar_url: "",
  active_role: "student"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  authRuntime.clearSession();
  authRuntime.store.setState({ hydrated: false, connectionError: false });
});
afterEach(() => {
  authRuntime.clearSession();
  vi.restoreAllMocks();
});

describe("useSessionRestore + runtime + HTTP", () => {
  it.each([503, "offline"])(
    "refresh %s 不判未登录，手动重试可恢复",
    async (failure) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      if (failure === 503) fetch.mockResolvedValueOnce(json({}, 503));
      else fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const { result, rerender } = renderHook(() => useSessionRestore());
      await waitFor(() =>
        expect(authRuntime.store.getState().connectionError).toBe(true)
      );
      expect(authRuntime.store.getState()).toMatchObject({
        hydrated: false,
        user: null
      });
      rerender();
      expect(fetch).toHaveBeenCalledTimes(1);
      fetch
        .mockResolvedValueOnce(json({ access_token: "new", expires_in: 900 }))
        .mockResolvedValueOnce(json(user));
      await act(() => result.current.retry());
      expect(authRuntime.store.getState()).toMatchObject({
        user,
        hydrated: true,
        connectionError: false
      });
      expect(fetch).toHaveBeenCalledTimes(3);
    }
  );

  it("资料恢复失败后，单独刷新 token 不能清掉恢复错误", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ access_token: "first", expires_in: 900 }))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ access_token: "second", expires_in: 900 }));
    renderHook(() => useSessionRestore());
    await waitFor(() =>
      expect(authRuntime.store.getState().connectionError).toBe(true)
    );
    await act(() => authRuntime.tokens.refreshTokens());
    expect(authRuntime.store.getState()).toMatchObject({
      hydrated: false,
      connectionError: true,
      user: null
    });
  });

  it("明确 refresh 401 才标记未登录", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({}, 401));
    renderHook(() => useSessionRestore());
    await waitFor(() =>
      expect(authRuntime.store.getState().hydrated).toBe(true)
    );
    expect(authRuntime.store.getState().user).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("资料 503 不放行身份，online 后只重试资料", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ access_token: "new", expires_in: 900 }))
      .mockResolvedValueOnce(json({}, 503));
    renderHook(() => useSessionRestore());
    await waitFor(() =>
      expect(authRuntime.store.getState().connectionError).toBe(true)
    );
    expect(authRuntime.store.getState()).toMatchObject({
      hydrated: false,
      user: null
    });
    fetch.mockResolvedValueOnce(json(user));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(authRuntime.store.getState().hydrated).toBe(true)
    );
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))
    ).toHaveLength(1);
    expect(authRuntime.store.getState().user).toEqual(user);
  });
});
