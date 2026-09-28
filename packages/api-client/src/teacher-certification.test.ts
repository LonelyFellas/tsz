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
