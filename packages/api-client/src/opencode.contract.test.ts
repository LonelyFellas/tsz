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

it("模型配置与 Key 使用独立接口并校验响应白名单", async () => {
  const choice = {
    source: "opencode",
    provider_id: "test",
    model_id: "paid"
  } as const;
  const get = vi
    .fn()
    .mockResolvedValueOnce({
      models: [
        { provider_id: "test", model_id: "paid", name: "Paid", enabled: true }
      ]
    })
    .mockResolvedValueOnce({
      providers: [{ id: "test", name: "Test", connected: true }]
    })
    .mockResolvedValueOnce(choice);
  const put = vi.fn().mockResolvedValue(choice);
  const post = vi.fn().mockResolvedValue(undefined);
  const api = createOpenCodeEndpoints({
    get,
    put,
    post
  } as unknown as HttpClient);
  const signal = new AbortController().signal;
  expect((await api.models({ signal })).models).toHaveLength(1);
  expect((await api.providers({ signal })).providers).toHaveLength(1);
  expect(await api.currentModel({ signal })).toEqual(choice);
  expect(await api.selectModel(choice)).toEqual(choice);
  await api.connectKey({ provider_id: "test", api_key: "synthetic-key" });
  expect(get.mock.calls).toEqual([
    ["/opencode/models", { signal }],
    ["/opencode/providers", { signal }],
    ["/opencode/model", { signal }]
  ]);
  expect(put).toHaveBeenCalledExactlyOnceWith("/opencode/model", choice);
  expect(post).toHaveBeenCalledExactlyOnceWith("/opencode/keys", {
    provider_id: "test",
    api_key: "synthetic-key"
  });
  get.mockResolvedValueOnce({
    models: [
      {
        provider_id: "test",
        model_id: "paid",
        name: "Paid",
        enabled: true,
        api_key: "must-not-leak"
      }
    ]
  });
  await expect(api.models()).rejects.toThrow("OpenCode 响应不符合接口契约");
  expect(snapshot.paths["/admin/opencode/model"]).toEqual(["get", "put"]);
});

it("全量探针通过独立异步端点执行，读取结果不重复发起模型调用", async () => {
  const report = {
    batch_id: "00000000-0000-0000-0000-000000000001",
    state: "running",
    started_at: "2026-10-28T16:00:00Z",
    finished_at: null,
    models: [
      {
        source: "opencode",
        provider_id: "test",
        model_id: "paid",
        name: "Paid",
        enabled: true,
        status: "unavailable",
        checked_at: "2026-10-28T16:00:01Z",
        duration_ms: 1,
        http_status: 503,
        error: "request_failed",
        cost: null
      }
    ]
  };
  const get = vi.fn().mockResolvedValue(report);
  const post = vi.fn().mockResolvedValue(report);
  const api = createOpenCodeEndpoints({ get, post } as unknown as HttpClient);
  const signal = new AbortController().signal;
  expect(await api.probeReport({ signal })).toEqual(report);
  expect(await api.probeAll()).toEqual(report);
  expect(get).toHaveBeenCalledExactlyOnceWith("/opencode/probes", { signal });
  expect(post).toHaveBeenCalledExactlyOnceWith("/opencode/probes");
  get.mockResolvedValueOnce({
    ...report,
    context: "private-credential-fingerprint"
  });
  await expect(api.probeReport()).rejects.toThrow(
    "OpenCode 响应不符合接口契约"
  );
  expect(snapshot.paths["/admin/opencode/probes"]).toEqual(["get", "post"]);
});

it("按凭据切换和登出，列表拒绝秘密字段", async () => {
  const data = {
    providers: [
      {
        id: "opencode",
        name: "OpenCode",
        connections: [
          { id: "cred_oauth", method: "oauth", label: "TSZ", active: true },
          { id: "cred_key", method: "key", label: "TSZ", active: false },
          { id: null, method: "env", label: "TEST_KEY", active: false }
        ]
      }
    ]
  };
  const get = vi.fn().mockResolvedValue(data);
  const del = vi.fn().mockResolvedValue(undefined);
  const post = vi.fn().mockResolvedValue(undefined);
  const api = createOpenCodeEndpoints({
    get,
    del,
    post
  } as unknown as HttpClient);
  const signal = new AbortController().signal;
  expect(await api.connectedProviders({ signal })).toEqual(data);
  expect(get).toHaveBeenCalledWith("/opencode/connections", { signal });
  await api.disconnectConnection("provider/one", "credential/one");
  expect(del).toHaveBeenCalledExactlyOnceWith(
    "/opencode/providers/provider%2Fone/connections/credential%2Fone"
  );
  await api.activateConnection("opencode", "cred_key");
  expect(post).toHaveBeenCalledExactlyOnceWith(
    "/opencode/providers/opencode/connections/cred_key/activate"
  );
  expect(snapshot.paths["/admin/opencode/connections"]).toEqual(["get"]);
  expect(
    snapshot.paths[
      "/admin/opencode/providers/{provider_id}/connections/{connection_id}"
    ]
  ).toEqual(["delete"]);
  expect(
    snapshot.paths[
      "/admin/opencode/providers/{provider_id}/connections/{connection_id}/activate"
    ]
  ).toEqual(["post"]);
  get.mockResolvedValue({
    providers: [
      {
        ...data.providers[0],
        connections: [
          { ...data.providers[0]!.connections[0], api_key: "must-not-leak" }
        ]
      }
    ]
  });
  await expect(api.connectedProviders()).rejects.toThrow();
});
