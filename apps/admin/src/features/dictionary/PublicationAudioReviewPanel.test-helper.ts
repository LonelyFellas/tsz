import { api } from "@/lib/auth";
import { onTestFinished, vi } from "vitest";

/** Explicit prior-review prerequisite for non-audio publication tests only. */
export function confirmedPublicationAudioFixture() {
  const check = vi
    .spyOn(api.words.publicationAudio, "check")
    .mockImplementation(async (id, input) => ({
      manifest: {
        owner: { entry: id },
        revision: input.base_revision,
        policy_version: 1,
        manifest_hash: "a".repeat(64),
        ready: true,
        items: (["uk", "us"] as const).map((accent, index) => ({
          target_id: id,
          content_id: null,
          source_path: `/forms/contents/0/regional_variants/${accent}/pronunciations/0`,
          default_for: [accent],
          setting: null,
          asset_id: index
            ? "00000000-0000-4000-8000-000000009801"
            : "00000000-0000-4000-8000-000000009800",
          source: null,
          issue: null
        }))
      },
      confirmed: true,
      receipt_id: "00000000-0000-4000-8000-000000009899"
    }));
  onTestFinished(() => check.mockRestore());
  return check;
}
