import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReleaseComposition,
  recoveryPlan,
  validateReleaseComposition
} from "./release-composition.mjs";
import {
  createReleaseState,
  transitionReleaseState
} from "./release-state.mjs";

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

test("recovery drill resumes after Web accepted and Admin failure", () => {
  const partial = buildReleaseComposition({
    state: "web-accepted",
    candidateSha: SHA,
    runId: 10,
    attempt: 1,
    apiSha: API_SHA,
    web: manifest("web"),
    admin: null
  });
  validateReleaseComposition(partial);
  assert.deepEqual(recoveryPlan(partial), {
    action: "resume",
    resume_from: "web-accepted",
    skip_components: ["web"],
    publish_components: ["admin"],
    api_sha: API_SHA
  });

  let resumed = createReleaseState({
    release_id: "recovery-1",
    candidate_sha: SHA,
    ci_run_id: 10,
    ci_run_attempt: 1
  });
  resumed = transitionReleaseState(resumed, "dependencies-ready");
  resumed = transitionReleaseState(resumed, "contract-compatible", {
    api_sha: API_SHA
  });
  resumed = transitionReleaseState(resumed, "web-deploying", {
    component: "web"
  });
  resumed = transitionReleaseState(resumed, "web-accepted", {
    component: "web",
    component_sha: SHA
  });
  resumed = transitionReleaseState(resumed, "admin-deploying", {
    component: "admin"
  });
  resumed = transitionReleaseState(resumed, "accepted", {
    component: "admin",
    component_sha: SHA
  });
  assert.equal(resumed.state, "accepted");
});
