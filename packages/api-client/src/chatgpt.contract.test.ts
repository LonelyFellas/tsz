import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { createChatGPTEndpoints } from "./chatgpt";
import snapshot from "./openapi.snapshot.json";

const attempt = {
  attempt_id: "00000000-0000-0000-0000-000000000001",
  authorization_url:
    "https://auth.openai.com/api/accounts/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback",
  expires_at: "2026-10-29T08:00:00Z"
};
const accounts = {
  configured: true,
  active: "oaiapp_test",
  accounts: [
    {
      client_id: "oaiapp_test",
      email: "fixture@example.test",
      signed_in: true,
      plan_enabled: true
    }
  ],
  pending_login: null
};
const status = {
  status: "pending",
  expires_at: attempt.expires_at,
  error: null
};

it("ChatGPT 账号与授权遵守独立后台契约和取消信号", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce(accounts)
    .mockResolvedValueOnce(status);
  const post = vi.fn().mockResolvedValue(attempt);
  const put = vi.fn().mockResolvedValue(accounts);
  const del = vi
    .fn()
    .mockResolvedValueOnce({ ...status, status: "cancelled" })
    .mockResolvedValueOnce({ remote_revoked: false });
  const api = createChatGPTEndpoints({
    get,
    post,
    put,
    del
  } as unknown as HttpClient);
  const signal = new AbortController().signal;
  expect(await api.accounts({ signal })).toEqual(accounts);
  expect(await api.login()).toEqual(attempt);
  expect(await api.loginStatus(attempt.attempt_id, { signal })).toEqual(status);
  expect((await api.cancelLogin(attempt.attempt_id)).status).toBe("cancelled");
  expect(await api.useAccount("oaiapp_test")).toEqual(accounts);
  expect(await api.logout("oaiapp_test")).toEqual({ remote_revoked: false });
  expect(get.mock.calls).toEqual([
    ["/chatgpt", { signal }],
    [`/chatgpt/login/${attempt.attempt_id}`, { signal }]
  ]);
  expect(post).toHaveBeenCalledWith("/chatgpt/login", { client_id: null });
  expect(put).toHaveBeenCalledWith("/chatgpt/account", {
    client_id: "oaiapp_test"
  });
  expect(snapshot.paths["/admin/chatgpt"]).toEqual(["get"]);
  expect(snapshot.paths["/admin/chatgpt/login/{attempt_id}"]).toEqual([
    "delete",
    "get"
  ]);
});

it("拒绝凭据字段、未知状态、不可信授权和回调地址，包括恢复中的登录", async () => {
  const get = vi.fn();
  const post = vi.fn();
  const api = createChatGPTEndpoints({ get, post } as unknown as HttpClient);
  for (const value of [
    { ...accounts, access_token: "must-not-leak" },
    {
      ...accounts,
      accounts: [{ ...accounts.accounts[0], refresh_token: "must-not-leak" }]
    },
    {
      ...accounts,
      pending_login: { ...attempt, authorization_url: "https://evil.test" }
    }
  ]) {
    get.mockResolvedValue(value);
    await expect(api.accounts()).rejects.toThrow();
  }
  get.mockResolvedValue({ ...status, status: "unknown" });
  await expect(api.loginStatus(attempt.attempt_id)).rejects.toThrow();
  for (const url of [
    "https://auth.openai.com.evil.test/api/accounts/authorize",
    "javascript:alert(1)",
    attempt.authorization_url.replace("127.0.0.1", "evil.test"),
    attempt.authorization_url + "&access_token=must-not-leak"
  ]) {
    post.mockResolvedValue({ ...attempt, authorization_url: url });
    await expect(api.login()).rejects.toThrow();
  }
});
