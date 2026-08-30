import { describe, expect, it } from "vitest";
import { pendingSentenceTargetFromState } from "./pendingSentenceTargetNavigation";

describe("pendingSentenceTargetFromState", () => {
  it("只接受完整的本地导航预填，不把任意 state 当业务 wire", () => {
    expect(
      pendingSentenceTargetFromState({
        pendingSentenceTarget: {
          associationId: "association-1",
          headword: "center of the wall",
          gloss: "墙的中心位置",
          returnTo: "/words/source/v3/wizard/meanings?mode=edit"
        }
      })
    ).toEqual({
      associationId: "association-1",
      headword: "center of the wall",
      gloss: "墙的中心位置",
      returnTo: "/words/source/v3/wizard/meanings?mode=edit"
    });
    expect(
      pendingSentenceTargetFromState({ pendingSentenceTarget: {} })
    ).toBeUndefined();
  });
});
