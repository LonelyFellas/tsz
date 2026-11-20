import assert from "node:assert/strict";
import test from "node:test";
import { buildReleaseComposition } from "./release-composition.mjs";

const SHA = "a".repeat(40);
const API_SHA = "b".repeat(40);

function manifest(component) {
  return {
    component,
    source: { repository: "LonelyFellas/tsz", git_sha: SHA },
    ci: { run_id: 10 },
    artifact: { sha256: "c".repeat(64) },
    accepted_at: "2026-11-20T00:00:00.000Z"
  };
}

test("builds a partial composition while Web is accepted", () => {
  const result = buildReleaseComposition({
    state: "web-accepted",
    candidateSha: SHA,
    runId: 10,
    attempt: 1,
    apiSha: API_SHA,
    web: manifest("web"),
    admin: null
  });
  assert.equal(result.state, "web-accepted");
  assert.equal(result.components.web.git_sha, SHA);
  assert.equal(result.components.admin, null);
});

test("requires both components for an accepted composition", () => {
  assert.throws(() =>
    buildReleaseComposition({
      state: "accepted",
      candidateSha: SHA,
      runId: 10,
      attempt: 1,
      apiSha: API_SHA,
      web: manifest("web"),
      admin: null
    })
  );
});
