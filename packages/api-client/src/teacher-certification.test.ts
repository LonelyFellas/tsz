import type { UserNotification } from "@tsz/types";
import snapshot from "./openapi.snapshot.json";
import { afterEach, expect, it, vi } from "vitest";
import { createHttpClient } from "./http";
import { createEndpoints } from "./endpoints";
import { createAdminEndpoints } from "./admin";

afterEach(() => vi.unstubAllGlobals());

it("submits the complete certification payload to the implemented endpoint", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const api = createEndpoints(createHttpClient({ baseUrl: "/api/v1" }));
  expect(api).toHaveProperty("teacherCertification");
  const payload = {
    real_name: "姓名",
    contact: "a@example.test",
    statement: "说明",
    id_front: "front",
    id_back: "back",
    education_files: ["degree"],
    language_files: ["language"]
  };
  await api.teacherCertification.submit(payload);
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/me/teacher-certification/applications"
  );
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(payload);
});

it("keeps admin review endpoints separate from applicant endpoints", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const api = createAdminEndpoints(
    createHttpClient({ baseUrl: "/api/v1/admin" })
  );
  expect(api).toHaveProperty("teacherCertification");
  await api.teacherCertification.review(
    "application-1",
    "reject",
    "资料不清晰"
  );
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/admin/teacher-applications/application-1/review"
  );
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    decision: "reject",
    reason: "资料不清晰"
  });
});

it("keeps wordlist notification metadata optional in the backend contract", () => {
  const schema = snapshot.schemas.UserNotification;
  for (const field of [
    "wordlist_id",
    "wordlist_name",
    "actor_name",
    "amount"
  ]) {
    expect(schema.properties).toHaveProperty(field);
    expect(schema.required).not.toContain(field);
  }
  expect(schema.properties.amount.pattern).toBe("^[1-9][0-9]{0,18}$");
  expect(schema.properties.wordlist_id.format).toBe("uuid");
});

it.each(["wordlist_liked", "wordlist_tipped"] as const)(
  "reads and marks %s notifications without converting wire data",
  async (kind) => {
    const item: UserNotification = {
      id: "n1",
      application_id: null,
      kind,
      reason: null,
      wordlist_id: "list-1",
      wordlist_name: "四级词汇",
      actor_name: "小明",
      ...(kind === "wordlist_tipped" ? { amount: "9007199254740993" } : {}),
      created_at: "2026-10-15T00:00:00Z",
      read_at: null
    };
    const page = { items: [item], total: 1, unread_count: 1 };
    const read = { ...item, read_at: "2026-10-15T01:00:00Z" };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page)))
      .mockResolvedValueOnce(new Response(JSON.stringify(read)));
    vi.stubGlobal("fetch", fetch);
    const api = createEndpoints(createHttpClient({ baseUrl: "/api/v1" }));
    expect(await api.teacherCertification.notifications(2, 10)).toEqual(page);
    expect(fetch.mock.calls[0]![0]).toBe(
      "/api/v1/me/notifications?page=2&page_size=10"
    );
    expect(await api.teacherCertification.readNotification("n1")).toEqual(read);
    expect(fetch.mock.calls[1]![0]).toBe("/api/v1/me/notifications/n1/read");
    expect(fetch.mock.calls[1]![1].method).toBe("PATCH");
  }
);
