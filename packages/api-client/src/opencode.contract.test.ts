import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { createOpenCodeEndpoints } from "./opencode";
import snapshot from "./openapi.snapshot.json";

const login = {
  attempt_id: "attempt_123",
  authorization_url: "https://opencode.ai/console/device?user_code=TEST",
  expires_at: "2026-10-28T12:12:38.829Z"
};

it("OpenCode 连接与登录使用后台契约，并传递取消信号", async () => {
  const connection = {
    configured: true,
    connected: false,
    login_available: true
  };
  const get = vi
    .fn()
    .mockResolvedValueOnce(connection)
    .mockResolvedValueOnce({ status: "pending", expires_at: login.expires_at });
  const post = vi.fn().mockResolvedValue(login);
  const del = vi.fn().mockResolvedValue(undefined);
  const api = createOpenCodeEndpoints({
    get,
    post,
    del
  } as unknown as HttpClient);
  const signal = new AbortController().signal;
  expect(await api.connection({ signal })).toEqual(connection);
  expect(get).toHaveBeenNthCalledWith(1, "/opencode", { signal });
  expect(await api.login()).toEqual(login);
  expect(post).toHaveBeenCalledExactlyOnceWith("/opencode/login");
  expect(await api.loginStatus("attempt_123", { signal })).toEqual({
    status: "pending",
    expires_at: login.expires_at
  });
  expect(get).toHaveBeenNthCalledWith(2, "/opencode/login/attempt_123", {
    signal
  });
  await api.cancelLogin("attempt_123");
  expect(del).toHaveBeenCalledExactlyOnceWith("/opencode/login/attempt_123");
  expect(snapshot.paths["/admin/opencode"]).toEqual(["get"]);
  expect(snapshot.paths["/admin/opencode/login"]).toEqual(["post"]);
  expect(snapshot.paths["/admin/opencode/login/{attempt_id}"]).toEqual([
    "delete",
    "get"
  ]);
});

it("拒绝凭证泄漏字段、未知状态和不可信授权链接", async () => {
  const post = vi.fn();
  const get = vi
    .fn()
    .mockResolvedValue({ status: "unknown", expires_at: login.expires_at });
  const api = createOpenCodeEndpoints({ get, post } as unknown as HttpClient);
  await expect(api.loginStatus("attempt_123")).rejects.toThrow(
    "OpenCode 响应不符合接口契约"
  );
  for (const invalid of [
    { ...login, access_token: "must-not-reach-browser" },
    {
      ...login,
      authorization_url: "https://opencode.ai.evil.test/console/device"
    },
    { ...login, authorization_url: "javascript:alert(1)" },
    {
      ...login,
      authorization_url: "https://opencode.ai@evil.test/console/device"
    }
  ]) {
    post.mockResolvedValueOnce(invalid);
    await expect(api.login()).rejects.toThrow();
  }
});
