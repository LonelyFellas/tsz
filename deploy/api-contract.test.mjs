import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { verifyApiContract } from "./api-contract.mjs";
import { contractFixture } from "./api-contract-fixture.mjs";

test("the shared verifier uses isolated outputs and leaves tracked snapshots unchanged", async (t) => {
  const f = await contractFixture(t);
  const file = join(f.packageRoot, "src/openapi.snapshot.json");
  const before = await readFile(file, "utf8");
  const result = await verifyApiContract({
    sha: f.sha,
    spec: JSON.stringify(f.spec),
    packageRoot: f.packageRoot
  });
  assert.equal(result.api_sha, f.sha);
  assert.match(result.spec_sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.checked_files.length, 2);
  assert.equal(await readFile(file, "utf8"), before);
  assert.ok(
    !(await readdir(f.packageRoot)).some((name) =>
      name.startsWith(".api-compat-")
    )
  );
});

for (const scenario of ["schema", "runtime", "generator"]) {
  test(`contract ${scenario} failure cannot change snapshots or leave a temporary tree`, async (t) => {
    const f = await contractFixture(t);
    const spec = structuredClone(f.spec);
    if (scenario === "schema")
      spec.fixture["openapi.snapshot.json"].schemas.Used.type = "number";
    if (scenario === "runtime")
      spec.fixture["admin-word-v3.runtime-schema.json"].$defs.Used.type =
        "number";
    if (scenario === "generator") spec.fail_generator = true;
    await assert.rejects(
      verifyApiContract({
        sha: f.sha,
        spec: JSON.stringify(spec),
        packageRoot: f.packageRoot
      }),
      scenario === "generator"
        ? /derive frontend contract/
        : /differs.*\/Used\/type/
    );
    assert.ok(
      !(await readdir(f.packageRoot)).some((name) =>
        name.startsWith(".api-compat-")
      )
    );
    const expected = JSON.parse(
      await readFile(join(f.packageRoot, "src/openapi.snapshot.json"), "utf8")
    );
    assert.equal(expected.schemas.Used.type, "string");
  });
}

test("production CLI still reads the live manifest and emits only its verified SHA", async (t) => {
  const f = await contractFixture(t);
  const result = f.run("check-api-contract.mjs", {
    env: { SYNC_OPENAPI_RUNTIME_ONLY: "1" }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${f.sha}\n`);
  assert.match(await f.calls(), /^ssh /m);
  assert.match(await f.calls(), /gh .*\?ref=aaaaaaaa/);
});

test("production CLI cannot substitute a pinned target for the live API check", async (t) => {
  const f = await contractFixture(t);
  const override = f.run("check-api-contract.mjs", {
    args: ["--target", f.targetFile]
  });
  assert.notEqual(override.status, 0);
  assert.equal(await f.calls(), "");
  const unavailable = f.run("check-api-contract.mjs", {
    env: { TEST_SSH_FAIL: "1" }
  });
  assert.notEqual(unavailable.status, 0);
  assert.match(unavailable.stderr, /deployed API or API deployment is active/);
  assert.doesNotMatch(await f.calls(), /^gh /m);
});

test("a wrong live API source is rejected before retrieving a contract", async (t) => {
  const f = await contractFixture(t);
  await writeFile(
    f.manifestFile,
    JSON.stringify({
      component: "api",
      source: {
        repository: "another/repository",
        remote_ref: "refs/heads/main",
        git_sha: f.sha
      }
    })
  );
  const result = f.run("check-api-contract.mjs");
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(await f.calls(), /^gh /m);
});
