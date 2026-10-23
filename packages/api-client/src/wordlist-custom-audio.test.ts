import { expect, it, vi } from "vitest";
import {
  createAdminWordlistEndpoints,
  createWordlistEndpoints
} from "./wordlists";
import {
  decodeCustomAudio,
  decodeCustomAudioUrl
} from "./wordlist-custom-audio";
import type { HttpClient } from "./http";
const id = "019a1111-1111-7111-8111-111111111111";
const other = "019a1111-1111-7111-8111-111111111112";
const job = {
  item_id: id,
  job_id: other,
  word: "my word",
  status: "ready",
  locales: ["en-GB", "en-US"]
};
it("separates public, owner, current admin and review routes with cancellable filtered requests", async () => {
  const http = {
    get: vi.fn().mockResolvedValue({ items: [job] })
  } as unknown as HttpClient;
  const signal = new AbortController().signal;
  const api = createWordlistEndpoints(http);
  const admin = createAdminWordlistEndpoints(http);
  const suffix = `?item_ids=${encodeURIComponent(`${id},${other}`)}`;
  for (const [call, path] of [
    [() => api.customAudio(id, [id, other], { signal }), `/wordlists/${id}`],
    [
      () => api.myCustomAudio(id, [id, other], { signal }),
      `/me/wordlists/${id}`
    ],
    [() => admin.customAudio(id, [id, other], { signal }), `/wordlists/${id}`],
    [
      () => admin.reviewCustomAudio(id, other, [id, other], { signal }),
      `/wordlists/${id}/review-requests/${other}`
    ]
  ] as const) {
    expect(await call()).toEqual({ items: [job] });
    expect(http.get).toHaveBeenLastCalledWith(`${path}/custom-audio${suffix}`, {
      signal
    });
  }
  expect(() => api.myCustomAudio(id, Array(101).fill(other))).toThrow();
});
it("signs each locale under the matching authorization scope", async () => {
  const signed = {
    url: "https://example.com/signed",
    expires_at: "2026-10-23T10:00:00Z",
    url_expires_in_seconds: 300
  };
  const http = {
    get: vi.fn().mockResolvedValue(signed)
  } as unknown as HttpClient;
  const signal = new AbortController().signal;
  const api = createWordlistEndpoints(http);
  const admin = createAdminWordlistEndpoints(http);
  await api.myCustomAudioUrl(id, other, "en-GB", { signal });
  expect(http.get).toHaveBeenLastCalledWith(
    `/me/wordlists/${id}/custom-audio/${other}/en-GB`,
    { signal }
  );
  await api.customAudioUrl(id, other, "en-US", { signal });
  expect(http.get).toHaveBeenLastCalledWith(
    `/wordlists/${id}/custom-audio/${other}/en-US`,
    { signal }
  );
  await admin.customAudioUrl(id, other, "en-US", { signal });
  expect(http.get).toHaveBeenLastCalledWith(
    `/wordlists/${id}/custom-audio/${other}/en-US`,
    { signal }
  );
  await admin.reviewCustomAudioUrl(id, other, id, "en-GB", { signal });
  expect(http.get).toHaveBeenLastCalledWith(
    `/wordlists/${id}/review-requests/${other}/custom-audio/${id}/en-GB`,
    { signal }
  );
});
it("requires both locales only for ready and rejects unknown status or invalid signed URLs", () => {
  expect(decodeCustomAudio({ items: [] })).toEqual({ items: [] });
  for (const status of ["queued", "processing", "refunding", "refunded"]) {
    expect(
      decodeCustomAudio({ items: [{ ...job, status, locales: [] }] }).items[0]
        ?.status
    ).toBe(status);
    expect(() => decodeCustomAudio({ items: [{ ...job, status }] })).toThrow();
  }
  expect(() =>
    decodeCustomAudio({ items: [{ ...job, locales: ["en-GB"] }] })
  ).toThrow();
  expect(() =>
    decodeCustomAudio({ items: [{ ...job, status: "failed" }] })
  ).toThrow();
  expect(() =>
    decodeCustomAudioUrl({
      url: "javascript:alert(1)",
      expires_at: "x",
      url_expires_in_seconds: 300
    })
  ).toThrow();
});
