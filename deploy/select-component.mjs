import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { validateManifest } from "./provenance.mjs";
import { assertExpectedNodeVersion } from "../scripts/check-node-runtime.mjs";

assertExpectedNodeVersion(process.version);
const shaPattern = /^[0-9a-f]{40}$/;

function git(args, cwd) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024
  });
}

// Both applications consume every current shared package (including config).
// Treat all packages and all unclassified paths as inputs; only the other known
// application and explicitly non-build documentation can be ignored.
export function affectsComponent(file, component) {
  assert.ok(component === "web" || component === "admin");
  const other = component === "web" ? "admin" : "web";
  if (file.startsWith(`apps/${other}/`)) return false;
  if (
    ["docs/", ".agents/", ".claude/"].some((prefix) => file.startsWith(prefix))
  )
    return false;
  return !["AGENTS.md", "README.md"].includes(file);
}

function validateReceipt(receipt, manifest) {
  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.component, manifest.component);
  assert.deepEqual(receipt.identity, {
    repository: manifest.source.repository,
    sha: manifest.source.git_sha,
    tree: manifest.source.git_tree,
    runId: manifest.ci.run_id,
    attempt: receipt.identity.attempt
  });
  assert.ok(
    Number.isSafeInteger(receipt.identity.attempt) &&
      receipt.identity.attempt > 0
  );
  assert.equal(
    receipt.artifact_sha256,
    manifest.artifact.sha256,
    "accepted CI receipt artifact mismatch"
  );
  assert.match(receipt.release_id, /^[a-zA-Z0-9-]+$/);
  assert.equal(receipt.platform, "linux");
  assert.equal(receipt.arch, "x64");
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.checks?.entry, "passed");
  if (manifest.component === "web") {
    assert.equal(receipt.checks?.boot, "passed");
    assert.equal(receipt.checks?.sharp, "passed");
  }
}

export function selectComponent({ component, candidate, state, cwd }) {
  assert.ok(component === "web" || component === "admin");
  assert.equal(candidate.component, component);
  assert.match(candidate.identity.sha, shaPattern);
  assert.match(candidate.identity.tree, shaPattern);
  assert.equal(state.schema_version, 1);
  const result = {
    component,
    action: "deploy",
    candidate_sha: candidate.identity.sha,
    accepted_sha: state.manifest?.source?.git_sha ?? null
  };
  const deploy = (reason) => ({ ...result, reason });
  if (state.manifest === null) return deploy("no-accepted-manifest");
  const manifest = validateManifest(state.manifest);
  assert.equal(manifest.component, component);
  if (state.receipt === null) return deploy("no-accepted-ci-receipt");
  validateReceipt(state.receipt, manifest);
  if (
    state.receipt.node !== candidate.node ||
    !isDeepStrictEqual(state.receipt.config, candidate.config)
  )
    return deploy("build-config-changed");
  const base = manifest.source.git_sha;
  const target = candidate.identity.sha;
  const baseTree = git(["rev-parse", `${base}^{tree}`], cwd);
  if (baseTree.status !== 0) return deploy("accepted-source-unavailable");
  assert.equal(
    baseTree.stdout.trim(),
    manifest.source.git_tree,
    "accepted Git tree mismatch"
  );
  const targetTree = git(["rev-parse", `${target}^{tree}`], cwd);
  assert.equal(targetTree.status, 0, "candidate Git source unavailable");
  assert.equal(
    targetTree.stdout.trim(),
    candidate.identity.tree,
    "candidate Git tree mismatch"
  );
  const ancestor = git(["merge-base", "--is-ancestor", base, target], cwd);
  if (ancestor.status === 1) return deploy("accepted-source-not-ancestor");
  assert.equal(ancestor.status, 0, "cannot compare accepted Git history");
  const diff = git(
    ["diff", "--name-only", "--no-renames", "-z", base, target, "--"],
    cwd
  );
  assert.equal(diff.status, 0, "cannot compare component inputs");
  const changed = diff.stdout.split("\0").filter(Boolean);
  const inputs = changed.filter((file) => affectsComponent(file, component));
  if (inputs.length)
    return {
      ...deploy("build-inputs-changed"),
      changed_inputs: inputs.slice(0, 20),
      changed_input_count: inputs.length
    };
  return {
    ...result,
    action: "skip",
    reason: "verified-inputs-unchanged",
    accepted_ci_run_id: manifest.ci.run_id,
    accepted_at: manifest.accepted_at,
    artifact_sha256: manifest.artifact.sha256,
    release_id: state.receipt.release_id
  };
}

export async function remoteStateScript(component, expectedApiSha = "") {
  assert.ok(component === "web" || component === "admin");
  assert.ok(expectedApiSha === "" || shaPattern.test(expectedApiSha));
  const provenance = await readFile(
    new URL("./provenance.mjs", import.meta.url),
    "utf8"
  );
  const dataUrl = (source) =>
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const reader = (
    await readFile(new URL("./accepted-release.mjs", import.meta.url), "utf8")
  ).replace('"./provenance.mjs"', JSON.stringify(dataUrl(provenance)));
  return `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
try {
const {readAcceptedRelease,probeAcceptedRelease}=await import(${JSON.stringify(dataUrl(reader))});
const apiSha=${JSON.stringify(expectedApiSha)};
if(apiSha){const api=JSON.parse(await readFile('/opt/tsz-deploy-manifests/api.json','utf8'));assert.equal(api.component,'api');assert.equal(api.source.repository,${JSON.stringify("LonelyFellas/tsz-rust")});assert.equal(api.source.remote_ref,'refs/heads/main');assert.equal(api.source.git_sha,apiSha);}
const state=await readAcceptedRelease({component:${JSON.stringify(component)}});
if(state.receipt)probeAcceptedRelease(${JSON.stringify(component)},state.receipt.release_id);
console.log(JSON.stringify(state));
} catch(error) { console.error(error.message); process.exitCode=1; }\n`;
}

if (import.meta.main) {
  const [action, component, ...args] = process.argv.slice(2);
  if (action === "remote-script") {
    process.stdout.write(await remoteStateScript(component, args[0]));
  } else if (action === "select") {
    const [bundle, stateFile, output] = args;
    const result = selectComponent({
      component,
      candidate: JSON.parse(await readFile(`${bundle}/release.json`, "utf8")),
      state: JSON.parse(await readFile(stateFile, "utf8"))
    });
    await writeFile(output, JSON.stringify(result));
    console.log(`[deploy-selection] ${JSON.stringify(result)}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `\n### ${component} component selection\n\nAction: **${result.action}** (${result.reason})\n\nCandidate: \`${result.candidate_sha}\`\n\nActual accepted: \`${result.accepted_sha ?? "unknown"}\`\n`
      );
    }
  } else throw new Error("unknown component selection action");
}
