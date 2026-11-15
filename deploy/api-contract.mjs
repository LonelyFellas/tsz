import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { resolve } from "node:path";
import { compareApiContract } from "./compare-api-contract.mjs";
import { assertExpectedNodeVersion } from "../scripts/check-node-runtime.mjs";

// import.meta.main is part of the pinned runtime. Older runtimes must fail,
// rather than treating an unsupported entrypoint flag as a successful no-op.
assertExpectedNodeVersion(process.version);

export const API_REPOSITORY = "LonelyFellas/tsz-rust";
export const MAX_SPEC_BYTES = 30 * 1024 * 1024;

export function validateApiSha(sha) {
  assert.ok(
    typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha),
    "API target must be a full lowercase commit SHA"
  );
  return sha;
}

export function deployedApiSha() {
  const remote = spawnSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "tshb-test",
      "test ! -e /opt/tsz-rust/deploy.lock && systemctl is-active --quiet tsz-rust && cat /opt/tsz-deploy-manifests/api.json"
    ],
    { encoding: "utf8", timeout: 15000 }
  );
  assert.equal(
    remote.status,
    0,
    "cannot verify the deployed API or API deployment is active"
  );
  const manifest = JSON.parse(remote.stdout);
  assert.equal(manifest.component, "api");
  assert.equal(manifest.source.repository, API_REPOSITORY);
  assert.equal(manifest.source.remote_ref, "refs/heads/main");
  return validateApiSha(manifest.source.git_sha);
}

export function deployedApiSpec(sha) {
  validateApiSha(sha);
  const response = spawnSync(
    "gh",
    [
      "api",
      "-H",
      "Accept: application/vnd.github.raw+json",
      `repos/${API_REPOSITORY}/contents/docs/openapi.json?ref=${sha}`
    ],
    { encoding: "utf8", maxBuffer: MAX_SPEC_BYTES, timeout: 60000 }
  );
  assert.equal(response.status, 0, "cannot retrieve the deployed API contract");
  return response.stdout;
}

// Execute only this checkout's generator. The downloaded contract is data and
// generated files live next to package dependencies, never in the tracked src.
export async function verifyApiContract({
  sha,
  spec,
  packageRoot = resolve("packages/api-client")
}) {
  validateApiSha(sha);
  assert.ok(
    typeof spec === "string" && Buffer.byteLength(spec) <= MAX_SPEC_BYTES,
    "API contract exceeds the maximum size"
  );
  const temp = await mkdtemp(resolve(packageRoot, ".api-compat-"));
  try {
    const specPath = resolve(temp, "openapi.json");
    await writeFile(specPath, spec);
    await mkdir(resolve(temp, "scripts"));
    await mkdir(resolve(temp, "src"));
    await copyFile(
      resolve(packageRoot, "scripts/sync-openapi.mjs"),
      resolve(temp, "scripts/sync-openapi.mjs")
    );
    const generated = spawnSync(
      process.execPath,
      [resolve(temp, "scripts/sync-openapi.mjs")],
      {
        env: {
          ...process.env,
          OPENAPI_SOURCE: specPath,
          SYNC_OPENAPI_RUNTIME_ONLY: "0"
        },
        encoding: "utf8",
        timeout: 60000
      }
    );
    assert.equal(
      generated.status,
      0,
      `cannot derive frontend contract: ${generated.stderr}`
    );
    const files = [
      "openapi.snapshot.json",
      "admin-word-v3.runtime-schema.json"
    ];
    for (const name of files) {
      const actual = JSON.parse(
        await readFile(resolve(temp, "src", name), "utf8")
      );
      const expected = JSON.parse(
        await readFile(resolve(packageRoot, "src", name), "utf8")
      );
      compareApiContract(actual, expected, name);
    }
    return {
      api_sha: sha,
      spec_sha256: createHash("sha256").update(spec).digest("hex"),
      checked_files: files
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
