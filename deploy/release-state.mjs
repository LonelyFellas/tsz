import assert from "node:assert/strict";
import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const RELEASE_STATE_SCHEMA_VERSION = 1;

const SHA = /^[0-9a-f]{40}$/;
const STATES = new Set([
  "candidate",
  "dependencies-ready",
  "contract-compatible",
  "web-deploying",
  "web-accepted",
  "admin-deploying",
  "accepted",
  "failed",
  "superseded"
]);

const TRANSITIONS = {
  candidate: new Set(["dependencies-ready", "failed", "superseded"]),
  "dependencies-ready": new Set([
    "contract-compatible",
    "failed",
    "superseded"
  ]),
  "contract-compatible": new Set(["web-deploying", "failed", "superseded"]),
  "web-deploying": new Set(["web-accepted", "failed", "superseded"]),
  "web-accepted": new Set(["admin-deploying", "accepted", "failed"]),
  "admin-deploying": new Set(["accepted", "failed", "superseded"]),
  accepted: new Set(),
  failed: new Set(),
  superseded: new Set()
};

function timestamp() {
  return new Date().toISOString();
}

function assertSha(value, label) {
  assert.match(value, SHA, `${label} must be a full lowercase SHA`);
}

export function createReleaseState({
  release_id,
  candidate_sha,
  ci_run_id,
  ci_run_attempt,
  api_sha = null
}) {
  assert.match(release_id, /^[a-zA-Z0-9-]+$/);
  assertSha(candidate_sha, "candidate_sha");
  assert.ok(Number.isSafeInteger(ci_run_id) && ci_run_id > 0);
  assert.ok(Number.isSafeInteger(ci_run_attempt) && ci_run_attempt > 0);
  if (api_sha !== null) assertSha(api_sha, "api_sha");
  return {
    schema_version: RELEASE_STATE_SCHEMA_VERSION,
    release_id,
    state: "candidate",
    candidate: {
      repository: "LonelyFellas/tsz",
      git_sha: candidate_sha,
      ci_run_id,
      ci_run_attempt
    },
    api: {
      git_sha: api_sha,
      contract_status: api_sha === null ? "pending" : "verified"
    },
    components: {
      web: { state: "pending", git_sha: null },
      admin: { state: "pending", git_sha: null }
    },
    history: [{ state: "candidate", at: timestamp() }],
    updated_at: timestamp()
  };
}

export function validateReleaseState(value) {
  assert.equal(value.schema_version, RELEASE_STATE_SCHEMA_VERSION);
  assert.match(value.release_id, /^[a-zA-Z0-9-]+$/);
  assert.ok(STATES.has(value.state), "invalid release state");
  assert.equal(value.candidate.repository, "LonelyFellas/tsz");
  assertSha(value.candidate.git_sha, "candidate.git_sha");
  assert.ok(Number.isSafeInteger(value.candidate.ci_run_id));
  assert.ok(Number.isSafeInteger(value.candidate.ci_run_attempt));
  if (value.api.git_sha !== null) assertSha(value.api.git_sha, "api.git_sha");
  assert.ok(["pending", "verified"].includes(value.api.contract_status));
  for (const component of ["web", "admin"]) {
    assert.ok(value.components[component]);
    assert.ok(
      ["pending", "deploying", "accepted", "failed"].includes(
        value.components[component].state
      )
    );
    if (value.components[component].git_sha !== null)
      assertSha(value.components[component].git_sha, `${component}.git_sha`);
  }
  assert.ok(Array.isArray(value.history) && value.history.length > 0);
  return value;
}

export function transitionReleaseState(current, next, details = {}) {
  validateReleaseState(current);
  assert.ok(STATES.has(next), "invalid next release state");
  assert.ok(
    TRANSITIONS[current.state].has(next),
    `invalid release transition ${current.state} -> ${next}`
  );
  const nextState = structuredClone(current);
  nextState.state = next;
  nextState.updated_at = timestamp();
  nextState.history.push({ state: next, at: nextState.updated_at, ...details });
  if (details.api_sha !== undefined) {
    assertSha(details.api_sha, "api_sha");
    nextState.api = { git_sha: details.api_sha, contract_status: "verified" };
  }
  if (details.component && ["web", "admin"].includes(details.component)) {
    nextState.components[details.component] = {
      state:
        next === "failed"
          ? "failed"
          : next.endsWith("accepted") || next === "accepted"
            ? "accepted"
            : "deploying",
      git_sha:
        details.component_sha ?? nextState.components[details.component].git_sha
    };
  }
  if (next === "contract-compatible") {
    assert.equal(nextState.api.contract_status, "verified");
  }
  if (next === "accepted") {
    assert.equal(nextState.api.contract_status, "verified");
    assert.equal(nextState.components.web.state, "accepted");
    assert.equal(nextState.components.admin.state, "accepted");
  }
  return validateReleaseState(nextState);
}

export async function writeReleaseState(file, state) {
  validateReleaseState(state);
  const temporary = `${file}.partial-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600
  });
  await rename(temporary, file);
  return state;
}

export async function readReleaseState(file) {
  return validateReleaseState(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.main) {
  const [command, file, ...args] = process.argv.slice(2);
  if (command === "init") {
    const state = createReleaseState({
      release_id: args[0],
      candidate_sha: args[1],
      ci_run_id: Number(args[2]),
      ci_run_attempt: Number(args[3])
    });
    await writeReleaseState(file, state);
    console.log(JSON.stringify(state));
  } else if (command === "transition") {
    const current = await readReleaseState(file);
    const next = transitionReleaseState(current, args[0], {
      ...(args[1] ? { api_sha: args[1] } : {}),
      ...(args[2] ? { component: args[2], component_sha: args[3] ?? null } : {})
    });
    await writeReleaseState(file, next);
    console.log(JSON.stringify(next));
  } else {
    throw new Error("usage: release-state.mjs init|transition <file> ...");
  }
}
