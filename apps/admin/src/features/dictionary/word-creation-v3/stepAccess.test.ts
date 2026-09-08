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

  it("forces someone else's draft to read-only preview", () => {
    // 别人的未发布草稿看得见但改不动：writable=false 与归档态同样落到只读 preview。
    expect(
      resolveV3StepAccess(word("draft", "meanings"), "forms", false, false)
    ).toMatchObject({
      effective: "preview",
      requestedReachable: false,
      readOnly: true
    });
    expect(
      resolveV3StepAccess(word("draft", "meanings"), "preview", false, false)
        .reachable
    ).toEqual(new Set(["preview"]));
  });

  it("leaves one's own draft writable when the flag is passed explicitly", () => {
    expect(
      resolveV3StepAccess(word("draft", "meanings"), "forms", false, true)
    ).toMatchObject({
      effective: "forms",
      readOnly: false
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
