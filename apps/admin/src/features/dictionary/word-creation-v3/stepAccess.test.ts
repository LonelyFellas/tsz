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
  it("clamps draft navigation to the server-authoritative max step", () => {
    expect(
      resolveV3StepAccess(word("draft", "forms"), "meanings", false)
    ).toMatchObject({
      requested: "meanings",
      effective: "forms",
      requestedReachable: false
    });
    expect(
      resolveV3StepAccess(word("draft", "forms"), "basics", false)
    ).toMatchObject({
      effective: "basics",
      requestedReachable: true
    });
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
