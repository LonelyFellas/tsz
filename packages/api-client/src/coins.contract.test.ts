import { afterEach, describe, expect, it, vi } from "vitest";
import { createEndpoints } from "./endpoints";
import { createAdminEndpoints } from "./admin";
import { createHttpClient } from "./http";
import { decodeCoinEntryPage, decodeCoinWallet } from "./coins";
import snapshot from "./openapi.snapshot.json";

const id = "00000000-0000-4000-8000-000000000001";
const wallet = {
  owner_type: "user",
  owner_id: id,
  balance: "9007199254740993",
  status: "open"
};
const entry = {
  id: "1",
  operation_id: id,
  kind: "credit",
  source_type: "reward",
  delta: "9007199254740993",
  balance_after: "9007199254740993",
  created_at: "2026-10-06T00:00:00Z"
};
const page = {
  items: [entry],
  pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
  snapshot: "1"
};
afterEach(() => vi.unstubAllGlobals());

describe("coins contract", () => {
  it.each(["user", "admin"])(
    "%s factory uses authenticated personal read endpoints",
    async (realm) => {
      const baseUrl = `https://example.test/api/v1${realm === "admin" ? "/admin" : ""}`;
      const http = createHttpClient({ baseUrl, getToken: () => "token" });
      const endpoints =
        realm === "admin" ? createAdminEndpoints(http) : createEndpoints(http);
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...wallet, owner_type: realm }))
        .mockResolvedValueOnce(Response.json(page));
      vi.stubGlobal("fetch", fetch);
      expect((await endpoints.coins.wallet()).balance).toBe("9007199254740993");
      expect(
        await endpoints.coins.entries({
          page: 2,
          page_size: 20,
          snapshot: "9223372036854775807"
        })
      ).toEqual(page);
      expect(fetch.mock.calls[0]![0]).toBe(`${baseUrl}/me/coins/wallet`);
      expect(fetch.mock.calls[1]![0]).toBe(
        `${baseUrl}/me/coins/entries?page=2&page_size=20&snapshot=9223372036854775807`
      );
      expect(fetch.mock.calls[0]![1].headers.get("Authorization")).toBe(
        "Bearer token"
      );
      expect(Object.keys(endpoints.coins).sort()).toEqual([
        "entries",
        "wallet"
      ]);
    }
  );
  it("preserves i64 precision and rejects number amounts, invalid decimals and overflow", () => {
    expect(decodeCoinWallet(wallet)).toBe(wallet);
    expect(
      decodeCoinWallet({ ...wallet, balance: "9223372036854775807" }).balance
    ).toBe("9223372036854775807");
    for (const balance of [
      1,
      -1,
      "01",
      "-1",
      "1.2",
      "1e3",
      "+1",
      " 1",
      "9223372036854775808",
      null
    ]) {
      expect(() => decodeCoinWallet({ ...wallet, balance })).toThrow();
    }
    expect(decodeCoinEntryPage(page)).toBe(page);
    for (const delta of [0, "0", "-0", "1.2", "-9223372036854775808"]) {
      expect(() =>
        decodeCoinEntryPage({ ...page, items: [{ ...entry, delta }] })
      ).toThrow();
    }
    expect(
      decodeCoinEntryPage({
        ...page,
        items: [{ ...entry, kind: "debit", delta: "-1" }]
      }).items[0]!.delta
    ).toBe("-1");
    expect(() => decodeCoinWallet({ ...wallet, status: "unknown" })).toThrow();
    expect(() =>
      decodeCoinWallet({ ...wallet, evidence_ref: "private" })
    ).toThrow();
    expect(() =>
      decodeCoinEntryPage({ ...page, items: [{ ...entry, reason: "private" }] })
    ).toThrow();
  });
  it("HTTP errors including an old backend 404 never become a zero wallet", async () => {
    const http = createHttpClient({ baseUrl: "https://example.test/api/v1" });
    const endpoints = createEndpoints(http);
    for (const status of [404, 500]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("unavailable", { status }))
      );
      await expect(endpoints.coins.wallet()).rejects.toMatchObject({ status });
      await expect(endpoints.coins.entries()).rejects.toMatchObject({ status });
    }
  });
  it("generated OpenAPI has exactly four read endpoints and strict amount schemas", () => {
    const paths = Object.entries(snapshot.paths).filter(([path]) =>
      path.includes("/coins/")
    );
    expect(paths.map(([path]) => path).sort()).toEqual([
      "/admin/me/coins/entries",
      "/admin/me/coins/wallet",
      "/me/coins/entries",
      "/me/coins/wallet"
    ]);
    for (const [path, methods] of paths) {
      expect(methods).toEqual(["get"]);
      const key = `get ${path}`;
      const operations: Record<string, { responses: Record<string, unknown> }> =
        snapshot.operationSchemas;
      expect(operations[key]!.responses["200"]).toEqual({
        $ref: `#/components/schemas/${path.endsWith("wallet") ? "CoinWallet" : "CoinEntryPage"}`
      });
    }
    expect(snapshot.schemas.CoinWallet.additionalProperties).toBe(false);
    expect(snapshot.schemas.CoinWallet.properties.balance).toMatchObject({
      type: "string",
      pattern: "^(0|[1-9][0-9]{0,18})$"
    });
    expect(snapshot.schemas.CoinEntry.required).toContain("balance_after");
    expect(
      snapshot.operationQueryParameters["get /me/coins/entries"].map(
        (p) => p.name
      )
    ).toEqual(["page", "page_size", "snapshot"]);
  });
});
