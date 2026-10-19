import { afterEach, expect, it, vi } from "vitest";
import { createHttpClient } from "./http";
import { createEndpoints } from "./endpoints";
import snapshot from "./openapi.snapshot.json";
const id = "00000000-0000-4000-8000-000000000001";
const request = {
  id,
  status: "pending",
  requested_at: "2026-10-06T00:00:00Z",
  effective_at: "2026-10-09T00:00:00Z",
  cancelled_at: null,
  completed_at: null,
  confirmed_balance: "9007199254740993",
  waive_balance: true,
  consent_version: "v1",
  consent_text: "consent"
};
const state = {
  request,
  coin_balance: "9007199254740993",
  consent_version: "v1",
  consent_text: "consent",
  server_time: "2026-10-06T00:00:00Z"
};
const input = {
  channel: "email" as const,
  code: "000000",
  expected_coin_balance: "9007199254740993",
  waive_balance: true,
  confirm_deletion: true,
  consent_version: "v1",
  idempotency_key: id
};
afterEach(() => vi.unstubAllGlobals());
it("new endpoints preserve signed decimal values and explicit request status", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(state))
    .mockResolvedValueOnce(Response.json(request, { status: 202 }))
    .mockResolvedValueOnce(
      Response.json({
        ...request,
        status: "cancelled",
        cancelled_at: "2026-10-06T01:00:00Z"
      })
    );
  vi.stubGlobal("fetch", fetch);
  const api = createEndpoints(
    createHttpClient({ baseUrl: "https://example.test/api/v1" })
  );
  expect(await api.auth.accountDeletion()).toEqual(state);
  expect(await api.auth.requestAccountDeletion(input)).toEqual(request);
  expect((await api.auth.cancelAccountDeletion(id)).status).toBe("cancelled");
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    "https://example.test/api/v1/me/account-deletion",
    "https://example.test/api/v1/me/account-deletion",
    `https://example.test/api/v1/me/account-deletion/${id}/cancel`
  ]);
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual(input);
});
it("OTP 401 is never refreshed or replayed, old backend 404 never falls back to DELETE", async () => {
  const refresh = vi.fn();
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response("invalid OTP", { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  const api = createEndpoints(
    createHttpClient({ baseUrl: "/api/v1", onRefresh: refresh })
  );
  await expect(api.auth.requestAccountDeletion(input)).rejects.toMatchObject({
    status: 401
  });
  expect(refresh).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockClear().mockResolvedValue(new Response("missing", { status: 404 }));
  await expect(api.auth.accountDeletion()).rejects.toMatchObject({
    status: 404
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("strict schema rejects imprecise amounts and undeclared internal fields", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const api = createEndpoints(createHttpClient({ baseUrl: "/api/v1" }));
  for (const invalid of [
    { ...state, coin_balance: 1 },
    { ...state, coin_balance: "9223372036854775808" },
    { ...state, request: { ...request, request_hash: "secret" } },
    { ...state, request: { ...request, status: "deleted" } }
  ]) {
    fetch.mockResolvedValueOnce(Response.json(invalid));
    await expect(api.auth.accountDeletion()).rejects.toThrow();
  }
});
it("old destructive DELETE has no success response in the new spec", () => {
  expect(
    Object.keys(
      snapshot.operationSchemas["delete /auth/account"].responses
    ).sort()
  ).toEqual(["401", "409"]);
  expect(
    snapshot.operationSchemas["post /me/account-deletion"].responses["202"]
  ).toEqual({ $ref: "#/components/schemas/AccountDeletionRequest" });
});
