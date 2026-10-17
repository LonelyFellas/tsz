import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { authRuntime } from "@/lib/auth";
import { useSessionRestore } from "./useSessionRestore";

afterEach(() => {
  authRuntime.clearSession();
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("首次恢复在水合前失败时不立即再刷新，联网后仍正常恢复", async () => {
  let available = false;
  const user = {
    id: "recover-user",
    display_name: "用户",
    avatar_url: "",
    roles: ["student"]
  };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me")) return Response.json({ user, onboarded: true });
    if (init?.method === "HEAD")
      return new Response(null, {
        status: 204,
        headers: { "x-refresh-recovery": "v1" }
      });
    return available
      ? Response.json({ access_token: "recovered", expires_in: 900 })
      : new Response(null, { status: 503 });
  });
  vi.stubGlobal("fetch", fetch);
  await import("@/instrumentation-client");
  await waitFor(() =>
    expect(authRuntime.store.getState().connectionError).toBe(true)
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  const hook = renderHook(() => useSessionRestore());
  await waitFor(() => expect(hook.result.current.retrying).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(authRuntime.store.getState().hydrated).toBe(false);

  available = true;
  await act(async () => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(authRuntime.store.getState().user).toEqual(user));
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === "POST")
  ).toHaveLength(2);
  hook.unmount();
});
