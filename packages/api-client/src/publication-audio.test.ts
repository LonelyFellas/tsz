import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import {
  createPublicationAudioEndpoints,
  decodePublicationAudioReview
} from "./publication-audio";

const id = "00000000-0000-4000-8000-000000000001";
function response() {
  return {
    manifest: {
      owner: { entry: id },
      revision: 2,
      policy_version: 1,
      items: [
        {
          target_id: id,
          content_id: null,
          source_path: "/forms/contents/0",
          default_for: ["uk"],
          setting: null,
          asset_id: null,
          source: null,
          issue: "missing_configuration"
        }
      ],
      ready: false,
      manifest_hash: "a".repeat(64)
    },
    confirmed: false,
    receipt_id: null
  };
}

it("passes the exact revision and reviewed manifest digest to distinct endpoints", async () => {
  const post = vi.fn().mockResolvedValue(response());
  const api = createPublicationAudioEndpoints({
    post
  } as unknown as HttpClient);
  const signal = new AbortController().signal;
  await api.check(id, { base_revision: 2 }, signal);
  await api.confirm(
    id,
    { base_revision: 2, manifest_hash: "a".repeat(64) },
    signal
  );
  expect(post.mock.calls).toEqual([
    [
      `/lexicon/entries/${id}/publication-audio/check`,
      { base_revision: 2 },
      { signal }
    ],
    [
      `/lexicon/entries/${id}/publication-audio/confirm`,
      { base_revision: 2, manifest_hash: "a".repeat(64) },
      { signal }
    ]
  ]);
});

it("rejects broken or expanded manifests rather than treating them as ready", () => {
  expect(decodePublicationAudioReview(response()).manifest.ready).toBe(false);
  const missing = response();
  Reflect.deleteProperty(missing.manifest.items[0]!, "asset_id");
  expect(() => decodePublicationAudioReview(missing)).toThrow();
  const expanded = response();
  Object.assign(expanded.manifest, { transaction_id: "internal" });
  expect(() => decodePublicationAudioReview(expanded)).toThrow();
  const expandedOwner = response();
  Object.assign(expandedOwner.manifest.owner, { unknown: true });
  expect(() => decodePublicationAudioReview(expandedOwner)).toThrow();
  const unknown = response();
  unknown.manifest.items[0]!.issue = "unknown_issue";
  expect(() => decodePublicationAudioReview(unknown)).toThrow();
  const contradictory = response();
  contradictory.confirmed = true;
  expect(() => decodePublicationAudioReview(contradictory)).toThrow();
});

it("uses the sentence namespace for independent sentence review", async () => {
  const value = response();
  const post = vi.fn().mockResolvedValue({
    ...value,
    manifest: { ...value.manifest, owner: { sentence: id } }
  });
  const api = createPublicationAudioEndpoints(
    { post } as unknown as HttpClient,
    "sentences"
  );
  await api.check(id, { base_revision: 2 });
  expect(post).toHaveBeenCalledWith(
    `/lexicon/sentences/${id}/publication-audio/check`,
    { base_revision: 2 },
    { signal: undefined }
  );
});
