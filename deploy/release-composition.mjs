import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const STATES = new Set(["web-accepted", "accepted"]);

function assertSha(value, label) {
  assert.match(value, SHA, `${label} must be a full lowercase SHA`);
}

function readManifest(root, component) {
  const file = path.join(root, `${component}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function validateComponentManifest(manifest, component) {
  if (manifest === null) return null;
  assert.equal(manifest.component, component);
  assert.equal(manifest.source.repository, "LonelyFellas/tsz");
  assertSha(manifest.source.git_sha, `${component}.source.git_sha`);
  assert.ok(Number.isSafeInteger(manifest.ci.run_id) && manifest.ci.run_id > 0);
  assert.match(manifest.artifact.sha256, /^[0-9a-f]{64}$/);
  return manifest;
}

function exactKeys(value, keys, label) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [...keys].sort(),
    `${label} fields are invalid`
  );
}

function validateComponentSummary(value, component) {
  if (value === null) return null;
  exactKeys(
    value,
    ["git_sha", "ci_run_id", "artifact_sha256", "accepted_at"],
    `${component} component`
  );
  assertSha(value.git_sha, `${component}.git_sha`);
  assert.ok(Number.isSafeInteger(value.ci_run_id) && value.ci_run_id > 0);
  assert.match(value.artifact_sha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof value.accepted_at, "string");
  assert.ok(!Number.isNaN(Date.parse(value.accepted_at)));
  return value;
}

export function validateReleaseComposition(value) {
  exactKeys(
    value,
    [
      "schema_version",
      "environment",
      "state",
      "candidate",
      "api",
      "components",
      "updated_at"
    ],
    "release composition"
  );
  assert.equal(value.schema_version, 1);
  assert.equal(value.environment, "tshb-test");
  assert.ok(STATES.has(value.state));
  exactKeys(
    value.candidate,
    ["repository", "git_sha", "ci_run_id", "ci_run_attempt"],
    "candidate"
  );
  assert.equal(value.candidate.repository, "LonelyFellas/tsz");
  assertSha(value.candidate.git_sha, "candidate.git_sha");
  assert.ok(
    Number.isSafeInteger(value.candidate.ci_run_id) &&
      value.candidate.ci_run_id > 0
  );
  assert.ok(
    Number.isSafeInteger(value.candidate.ci_run_attempt) &&
      value.candidate.ci_run_attempt > 0
  );
  exactKeys(value.api, ["repository", "git_sha", "contract_status"], "api");
  assert.equal(value.api.repository, "LonelyFellas/tsz-rust");
  assertSha(value.api.git_sha, "api.git_sha");
  assert.equal(value.api.contract_status, "verified");
  exactKeys(value.components, ["web", "admin"], "components");
  validateComponentSummary(value.components.web, "web");
  validateComponentSummary(value.components.admin, "admin");
  assert.equal(typeof value.updated_at, "string");
  assert.ok(!Number.isNaN(Date.parse(value.updated_at)));
  if (value.state === "web-accepted") assert.ok(value.components.web !== null);
  if (value.state === "accepted") {
    assert.ok(value.components.web !== null && value.components.admin !== null);
  }
  return value;
}

export function recoveryPlan(value) {
  validateReleaseComposition(value);
  if (value.state === "accepted") {
    return {
      action: "complete",
      resume_from: "accepted",
      skip_components: ["web", "admin"],
      publish_components: [],
      api_sha: value.api.git_sha
    };
  }
  return {
    action: "resume",
    resume_from: "web-accepted",
    skip_components: ["web"],
    publish_components: ["admin"],
    api_sha: value.api.git_sha
  };
}

export function buildReleaseComposition({
  state,
  candidateSha,
  runId,
  attempt,
  apiSha,
  web,
  admin,
  updatedAt = new Date().toISOString()
}) {
  assert.ok(STATES.has(state));
  assertSha(candidateSha, "candidateSha");
  assert.ok(Number.isSafeInteger(runId) && runId > 0);
  assert.ok(Number.isSafeInteger(attempt) && attempt > 0);
  assertSha(apiSha, "apiSha");
  web = validateComponentManifest(web, "web");
  admin = validateComponentManifest(admin, "admin");
  if (state === "accepted") assert.ok(web !== null && admin !== null);
  return validateReleaseComposition({
    schema_version: 1,
    environment: "tshb-test",
    state,
    candidate: {
      repository: "LonelyFellas/tsz",
      git_sha: candidateSha,
      ci_run_id: runId,
      ci_run_attempt: attempt
    },
    api: {
      repository: "LonelyFellas/tsz-rust",
      git_sha: apiSha,
      contract_status: "verified"
    },
    components: {
      web: web === null ? null : componentSummary(web),
      admin: admin === null ? null : componentSummary(admin)
    },
    updated_at: updatedAt
  });
}

function componentSummary(manifest) {
  return {
    git_sha: manifest.source.git_sha,
    ci_run_id: manifest.ci.run_id,
    artifact_sha256: manifest.artifact.sha256,
    accepted_at: manifest.accepted_at
  };
}

export function writeRemoteComposition({
  root = "/opt/tsz-deploy-manifests",
  state,
  candidateSha,
  runId,
  attempt,
  apiSha
}) {
  const api = JSON.parse(readFileSync(path.join(root, "api.json"), "utf8"));
  assert.equal(api.component, "api");
  assert.equal(api.source.repository, "LonelyFellas/tsz-rust");
  assert.equal(api.source.git_sha, apiSha);
  const composition = buildReleaseComposition({
    state,
    candidateSha,
    runId,
    attempt,
    apiSha,
    web: readManifest(root, "web"),
    admin: readManifest(root, "admin")
  });
  const file = path.join(root, "release-composition.json");
  const partial = `${file}.partial-${randomUUID()}`;
  writeFileSync(partial, `${JSON.stringify(composition, null, 2)}\n`, {
    mode: 0o600
  });
  renameSync(partial, file);
  return composition;
}

if (
  process.argv[1] === "-" &&
  !["validate", "recover"].includes(process.argv[2])
) {
  const [state, candidateSha, runId, attempt, apiSha, root] =
    process.argv.slice(2);
  console.log(
    JSON.stringify(
      writeRemoteComposition({
        root,
        state,
        candidateSha,
        runId: Number(runId),
        attempt: Number(attempt),
        apiSha
      })
    )
  );
} else if (process.argv[1]?.endsWith("release-composition.mjs")) {
  const [command, file] = process.argv.slice(2);
  assert.ok(command === "validate" || command === "recover");
  const value = JSON.parse(readFileSync(file, "utf8"));
  console.log(
    JSON.stringify(
      command === "validate"
        ? validateReleaseComposition(value)
        : recoveryPlan(value)
    )
  );
}
