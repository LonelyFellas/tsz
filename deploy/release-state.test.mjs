import assert from "node:assert/strict";
import test from "node:test";
import {
  createReleaseState,
  transitionReleaseState
} from "./release-state.mjs";

const SHA = "a".repeat(40);
const API_SHA = "b".repeat(40);

function initial() {
  return createReleaseState({
    release_id: "release-1",
    candidate_sha: SHA,
    ci_run_id: 10,
    ci_run_attempt: 1
  });
}

test("accepts the normal composition lifecycle and records component identities", () => {
  let state = initial();
  state = transitionReleaseState(state, "dependencies-ready");
  state = transitionReleaseState(state, "contract-compatible", {
    api_sha: API_SHA
  });
  state = transitionReleaseState(state, "web-deploying", { component: "web" });
  state = transitionReleaseState(state, "web-accepted", {
    component: "web",
    component_sha: SHA
  });
  state = transitionReleaseState(state, "admin-deploying", {
    component: "admin"
  });
  state = transitionReleaseState(state, "accepted", {
    component: "admin",
    component_sha: SHA
  });
  assert.equal(state.state, "accepted");
  assert.equal(state.api.git_sha, API_SHA);
  assert.equal(state.components.web.state, "accepted");
  assert.equal(state.components.admin.state, "accepted");
  assert.equal(state.history.length, 7);
});

test("rejects skipping a deployment gate", () => {
  assert.throws(
    () => transitionReleaseState(initial(), "accepted"),
    /invalid release transition/
  );
});

test("requires a verified API and both components before acceptance", () => {
  let state = initial();
  state = transitionReleaseState(state, "dependencies-ready");
  state = transitionReleaseState(state, "contract-compatible", {
    api_sha: API_SHA
  });
  state = transitionReleaseState(state, "web-deploying", { component: "web" });
  state = transitionReleaseState(state, "web-accepted", {
    component: "web",
    component_sha: SHA
  });
  state = transitionReleaseState(state, "admin-deploying", {
    component: "admin"
  });
  assert.throws(() => transitionReleaseState(state, "accepted"));
});

test("records a failed component without claiming acceptance", () => {
  let state = initial();
  state = transitionReleaseState(state, "dependencies-ready");
  state = transitionReleaseState(state, "contract-compatible", {
    api_sha: API_SHA
  });
  state = transitionReleaseState(state, "web-deploying", { component: "web" });
  state = transitionReleaseState(state, "failed", { component: "web" });
  assert.equal(state.state, "failed");
  assert.equal(state.components.web.state, "failed");
  assert.equal(state.components.admin.state, "pending");
});

test("allows a candidate to stop as superseded during component deployment", () => {
  let state = initial();
  state = transitionReleaseState(state, "dependencies-ready");
  state = transitionReleaseState(state, "contract-compatible", {
    api_sha: API_SHA
  });
  state = transitionReleaseState(state, "web-deploying", { component: "web" });
  state = transitionReleaseState(state, "superseded");
  assert.equal(state.state, "superseded");
});
