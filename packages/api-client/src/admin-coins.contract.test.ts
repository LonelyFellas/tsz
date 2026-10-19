import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminEndpoints } from "./admin";
import { createHttpClient } from "./http";
import type { ManualCreditRequest } from "@tsz/types";
import snapshot from "./openapi.snapshot.json";
const id = "00000000-0000-4000-8000-000000000001";
const operation = {
  id,
  owner_type: "user",
  owner_id: id,
  actor_id: id,
  source_type: "manual_purchase",
  event_id: "verified-1",
  delta: "9007199254740993",
  balance_after: "9007199254740993",
  reason: "private",
  evidence_ref: null,
  reverses_operation_id: null,
  reversed_by_operation_id: null,
  created_at: "2026-10-06T00:00:00Z"
};
const api = createAdminEndpoints(
  createHttpClient({ baseUrl: "https://example.test/api/v1/admin" })
);
afterEach(() => vi.unstubAllGlobals());
describe("manual coin contracts", () => {
  it("sends stable intent and event identifiers without numeric conversion; reversal takes no amount", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json(operation));
    vi.stubGlobal("fetch", fetch);
    const body: ManualCreditRequest = {
      owner_type: "user",
      owner_id: id,
      amount: "9007199254740993",
      category: "purchase",
      event_id: "verified-1",
      reason: "private",
      idempotency_key: id
    };
    expect((await api.coinManagement.credit(body)).delta).toBe(body.amount);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(body);
    await api.coinManagement.reverse(id, {
      idempotency_key: id,
      reason: "correction"
    });
    expect(fetch.mock.calls[1]![0]).toBe(
      `https://example.test/api/v1/admin/coins/manual-credits/${id}/reversal`
    );
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({
      idempotency_key: id,
      reason: "correction"
    });
  });
  it("rejects invalid managed wire values and surfaces absent older APIs", async () => {
    for (const delta of [1, "1.5", "9223372036854775808"]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ ...operation, delta }))
      );
      await expect(
        api.coinManagement.credit({} as ManualCreditRequest)
      ).rejects.toThrow();
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ...operation, secret: "unexpected" })
        )
    );
    await expect(
      api.coinManagement.reverse(id, { idempotency_key: id, reason: "x" })
    ).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 404 }))
    );
    await expect(
      api.coinManagement.accounts({ owner_type: "admin", search: id })
    ).rejects.toMatchObject({ status: 404 });
  });
  it("publishes strict request payload and management query contracts", () => {
    expect(snapshot.schemas.ManualCreditRequest.additionalProperties).toBe(
      false
    );
    expect(snapshot.schemas.ManualCreditRequest.required).toEqual(
      expect.arrayContaining([
        "event_id",
        "idempotency_key",
        "amount",
        "owner_type",
        "owner_id",
        "reason"
      ])
    );
    expect(
      Object.keys(snapshot.schemas.ManualReversalRequest.properties).sort()
    ).toEqual(["idempotency_key", "reason"]);
    expect(
      snapshot.operationQueryParameters["get /admin/coins/operations"].map(
        (p) => p.name
      )
    ).toEqual(
      expect.arrayContaining([
        "owner_type",
        "owner_id",
        "actor_id",
        "source_type",
        "created_from",
        "created_to"
      ])
    );
  });
});
