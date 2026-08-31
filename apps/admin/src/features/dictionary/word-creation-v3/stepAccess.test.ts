import type { AdminWordV3, WordCreationStep } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { resolveV3StepAccess } from "./stepAccess";

type AccessWord = Pick<AdminWordV3, "status" | "max_reachable_step">;

function word(
  status: AdminWordV3["status"],
  max_reachable_step: WordCreationStep
): AccessWord {
  return { status, max_reachable_step };
}

describe("resolveV3StepAccess", () => {
  it("allows draft navigation to every step regardless of the resume hint", () => {
    for (const requested of [
      "basics",
      "forms",
      "meanings",
      "preview"
    ] as const) {
      expect(
        resolveV3StepAccess(word("draft", "forms"), requested, false)
      ).toMatchObject({
        requested,
        effective: requested,
        requestedReachable: true
      });
    }
    expect(
      resolveV3StepAccess(word("draft", "forms"), "preview", false).reachable
    ).toEqual(new Set(["basics", "forms", "meanings", "preview"]));
  });

  it("forces archived and published read-only entries to preview", () => {
    expect(
      resolveV3StepAccess(word("archived", "meanings"), "forms", false)
    ).toMatchObject({
      effective: "preview",
      requestedReachable: false,
      readOnly: true
    });
    expect(
      resolveV3StepAccess(word("published", "preview"), "forms", false)
    ).toMatchObject({
      effective: "preview",
      readOnly: true
    });
  });

  it("keeps published edit mode bounded by max_reachable_step", () => {
    expect(
      resolveV3StepAccess(word("published", "meanings"), "preview", true)
    ).toMatchObject({
      effective: "meanings",
      requestedReachable: false,
      readOnly: false
    });
    expect(
      resolveV3StepAccess(word("published", "preview"), "preview", true)
    ).toMatchObject({
      effective: "preview",
      requestedReachable: true,
      readOnly: false
    });
  });
});
