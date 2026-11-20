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
  return {
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
  };
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

if (process.argv[1] === "-") {
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
}
