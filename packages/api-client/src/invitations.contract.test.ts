import { afterEach, expect, it, vi } from "vitest";
import { createEndpoints } from "./endpoints";
import { createHttpClient } from "./http";
import {
  decodeInvitationOverview,
  decodeInvitationRecords
} from "./invitations";
const overview = {
  invite_code: "0123456789ABCDEF",
  reward_amount: "9007199254740993",
  can_receive_reward: true
};
const item = {
  invitee_user_id: "00000000-0000-4000-8000-000000000001",
  invitee_name: "新同学",
  reward_status: "awarded",
  reward_amount: "9007199254740993",
  created_at: "2026-10-06T00:00:00Z"
};
const records = {
  items: [item],
  pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
};
afterEach(() => vi.unstubAllGlobals());
it("uses real authenticated endpoints and preserves decimal amounts", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(overview))
    .mockResolvedValueOnce(Response.json({ invite_code: overview.invite_code }))
    .mockResolvedValueOnce(Response.json(records));
  vi.stubGlobal("fetch", fetch);
  const api = createEndpoints(
    createHttpClient({
      baseUrl: "https://example.test/api/v1",
      getToken: () => "token"
    })
  );
  expect(await api.invitations.overview()).toEqual(overview);
  expect(await api.invitations.createCode()).toEqual({
    invite_code: overview.invite_code
  });
  expect(await api.invitations.records({ page: 2, page_size: 20 })).toEqual(
    records
  );
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    "https://example.test/api/v1/me/invitations",
    "https://example.test/api/v1/me/invitations/code",
    "https://example.test/api/v1/me/invitations/records?page=2&page_size=20"
  ]);
  expect(fetch.mock.calls[1]![1].method).toBe("POST");
  expect(fetch.mock.calls[0]![1].headers.get("Authorization")).toBe(
    "Bearer token"
  );
});
it("rejects unknown fields, malformed money and inconsistent reward status", () => {
  expect(
    decodeInvitationOverview({
      ...overview,
      reward_amount: null,
      invite_code: null
    }).reward_amount
  ).toBeNull();
  for (const reward_amount of [
    1,
    "0",
    "01",
    "-1",
    "9223372036854775808",
    undefined
  ])
    expect(() =>
      decodeInvitationOverview({ ...overview, reward_amount })
    ).toThrow();
  expect(() =>
    decodeInvitationOverview({ ...overview, private_note: "secret" })
  ).toThrow();
  for (const changed of [
    { ...item, email: "private@example.test" },
    { ...item, reward_status: "pending" },
    { ...item, reward_amount: "0" },
    { ...item, reward_status: "reward_disabled" }
  ])
    expect(() =>
      decodeInvitationRecords({ ...records, items: [changed] })
    ).toThrow();
  expect(
    decodeInvitationRecords({
      ...records,
      items: [
        {
          ...item,
          reward_status: "reward_disabled",
          reward_amount: "0",
          invitee_name: null
        }
      ]
    }).items[0]!.reward_amount
  ).toBe("0");
});
it("missing backend capability is an error, not zero rewards or an empty history", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ title: "Not found", status: 404 }, { status: 404 })
      )
  );
  const api = createEndpoints(
    createHttpClient({ baseUrl: "https://example.test/api/v1" })
  );
  await expect(api.invitations.overview()).rejects.toThrow();
  await expect(api.invitations.records()).rejects.toThrow();
});
