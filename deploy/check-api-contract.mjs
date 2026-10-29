import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { resolve } from "node:path";

// The existing generator defines exactly which backend contracts the frontend
// consumes. Generate in a disposable directory so the checkout is never changed.
const packageRoot = resolve("packages/api-client");
const temp = await mkdtemp(resolve(packageRoot, ".api-compat-"));
try {
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
  assert.equal(manifest.source.repository, "LonelyFellas/tsz-rust");
  assert.equal(manifest.source.remote_ref, "refs/heads/main");
  assert.match(manifest.source.git_sha, /^[0-9a-f]{40}$/);
  const spec = spawnSync(
    "gh",
    [
      "api",
      "-H",
      "Accept: application/vnd.github.raw+json",
      `repos/LonelyFellas/tsz-rust/contents/docs/openapi.json?ref=${manifest.source.git_sha}`
    ],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 60000 }
  );
  assert.equal(spec.status, 0, "cannot retrieve the deployed API contract");
  const specPath = resolve(temp, "openapi.json");
  await writeFile(specPath, spec.stdout);
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
  for (const name of [
    "openapi.snapshot.json",
    "admin-word-v3.runtime-schema.json"
  ]) {
    const actual = JSON.parse(
      await readFile(resolve(temp, "src", name), "utf8")
    );
    const expected = JSON.parse(
      await readFile(resolve(packageRoot, "src", name), "utf8")
    );
    for (const value of [actual, expected]) {
      delete value._source;
      delete value._generatedAt;
      delete value._source_sha256;
    }
    if (name === "openapi.snapshot.json") {
      for (const [path, methods] of Object.entries(expected.paths)) {
        assert.ok(
          Array.isArray(actual.paths[path]) &&
            methods.every((method) => actual.paths[path].includes(method)),
          `API method missing at ${path}`
        );
      }
      for (const section of [
        "operationHeaders",
        "operationQueryParameters",
        "operationSchemas",
        "schemas"
      ]) {
        for (const [key, value] of Object.entries(expected[section])) {
          assert.ok(
            JSON.stringify(actual[section][key]) === JSON.stringify(value),
            `API contract differs: ${section} ${key}`
          );
        }
      }
    } else {
      assert.ok(
        JSON.stringify(actual) === JSON.stringify(expected),
        `${name} differs from deployed API`
      );
    }
  }
  console.log(manifest.source.git_sha);
} finally {
  await rm(temp, { recursive: true, force: true });
}
