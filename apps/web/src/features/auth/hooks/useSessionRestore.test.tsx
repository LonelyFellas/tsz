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

it("启动入口提前恢复，与水合共享请求；恢复完再挂载不重复读取用户", async () => {
  let resolveRefresh!: (response: Response) => void;
  const refresh = new Promise<Response>((resolve) => {
    resolveRefresh = resolve;
  });
  const user = {
    id: "cold-start-user",
    display_name: "用户",
    avatar_url: "",
    roles: ["student"],
    active_role: "student"
  };
  const fetch = vi
    .fn()
    .mockReturnValueOnce(refresh)
    .mockResolvedValueOnce(
      Response.json({ user, onboarded: true, learning_settings: null })
    );
  vi.stubGlobal("fetch", fetch);

  await import("@/instrumentation-client");
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0]![0]).toBe("/api/v1/auth/refresh");
  const first = renderHook(() => useSessionRestore());
  expect(fetch).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveRefresh(
      Response.json({ access_token: "restored", expires_in: 900 })
    );
  });
  await waitFor(() => expect(authRuntime.store.getState().user).toEqual(user));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]![0]).toBe("/api/v1/me");
  first.unmount();
  const next = renderHook(() => useSessionRestore());
  expect(fetch).toHaveBeenCalledTimes(2);

  // 恢复后仍允许用户主动重试，不能把首次恢复结果永久缓存。
  fetch.mockResolvedValueOnce(Response.json({ user, onboarded: false }));
  await act(async () => next.result.current.retry());
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(authRuntime.store.getState().onboarded).toBe(false);
  next.unmount();

  // 已恢复过的页面遇到连接故障后重新挂载，仍应自动恢复。
  authRuntime.store.setState({ connectionError: true });
  fetch.mockResolvedValueOnce(Response.json({ user, onboarded: true }));
  const recovering = renderHook(() => useSessionRestore());
  await waitFor(() =>
    expect(authRuntime.store.getState().connectionError).toBe(false)
  );
  expect(fetch).toHaveBeenCalledTimes(4);
  recovering.unmount();
});
