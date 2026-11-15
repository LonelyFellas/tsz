import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { MAX_SPEC_BYTES } from "./api-contract.mjs";
import {
  downloadPinnedApiSpec,
  preflightApiContract,
  validateApiTarget
} from "./preflight-api-contract.mjs";
import { contractFixture } from "./api-contract-fixture.mjs";

test("importing API helpers from stdin or eval has no CLI or server side effects", async (t) => {
  const f = await contractFixture(t);
  const source = `await import(${JSON.stringify(new URL("./check-api-contract.mjs", import.meta.url).href)}); await import(${JSON.stringify(new URL("./preflight-api-contract.mjs", import.meta.url).href)}); console.log('imported');`;
  for (const args of [
    ["--input-type=module", "-"],
    ["--input-type=module", "-e", source, "ordinary-argument"]
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: f.root,
      input: source,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${join(f.root, "bin")}:${process.env.PATH}`,
        TEST_FORBID_SSH: "1"
      }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "imported\n");
  }
  assert.equal(await f.calls(), "");
});

test("an unsupported Node runtime fails before entrypoint detection or API IO", async (t) => {
  const f = await contractFixture(t);
  const source = `Object.defineProperty(process,'version',{value:'v20.0.0'}); await import(${JSON.stringify(new URL("./preflight-api-contract.mjs", import.meta.url).href)});`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    {
      cwd: f.root,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${join(f.root, "bin")}:${process.env.PATH}`,
        TEST_FORBID_SSH: "1"
      }
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Node\.js 24\.19\.0 is required/);
  assert.equal(await f.calls(), "");
});

test("preflight accepts only a fixed authoritative target, never a branch or arbitrary repository", () => {
  const target = {
    version: 1,
    environment: "tshb-test",
    repository: "LonelyFellas/tsz-rust",
    sha: "a".repeat(40)
  };
  assert.equal(validateApiTarget(target), target);
  for (const change of [
    { sha: "main" },
    { sha: "a".repeat(7) },
    { sha: "A".repeat(40) },
    { repository: "another/repo" },
    { environment: "production" },
    { version: 2 },
    { url: "https://example.invalid" }
  ]) {
    assert.throws(() => validateApiTarget({ ...target, ...change }));
  }
});

test("the public contract request is pinned, bounded and has no authorization header", async () => {
  const sha = "a".repeat(40);
  let called = false;
  assert.equal(
    await downloadPinnedApiSpec(sha, async (url, options) => {
      called = true;
      assert.equal(
        url,
        `https://raw.githubusercontent.com/LonelyFellas/tsz-rust/${sha}/docs/openapi.json`
      );
      assert.deepEqual(options.headers, { Accept: "application/json" });
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return new Response("contract");
    }),
    "contract"
  );
  assert.ok(called);
  await assert.rejects(
    downloadPinnedApiSpec("main", () => {
      throw new Error("must not fetch");
    }),
    /full lowercase commit/
  );
  await assert.rejects(
    downloadPinnedApiSpec(
      sha,
      async () => new Response("missing", { status: 404 })
    ),
    /HTTP 404/
  );
  await assert.rejects(
    downloadPinnedApiSpec(
      sha,
      async () =>
        new Response("", {
          headers: { "content-length": String(MAX_SPEC_BYTES + 1) }
        })
    ),
    /maximum size/
  );
  await assert.rejects(
    downloadPinnedApiSpec(
      sha,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(MAX_SPEC_BYTES + 1));
              controller.close();
            }
          }),
          { headers: { "content-length": "1" } }
        )
    ),
    /maximum size/
  );
});

test("PR preflight succeeds without SSH or gh and reports its exact contract identity", async (t) => {
  const f = await contractFixture(t);
  const result = f.run("preflight-api-contract.mjs", {
    args: ["--target", f.targetFile],
    shimFetch: true,
    env: { TEST_FORBID_SSH: "1" }
  });
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout.slice("[api-preflight] ".length));
  assert.equal(record.status, "compatible");
  assert.equal(record.target.sha, f.sha);
  assert.equal(record.scope, "pinned-api-contract");
  const calls = await f.calls();
  assert.match(calls, /^fetch /m);
  assert.doesNotMatch(calls, /^(ssh|gh) /m);
  assert.match(
    await readFile(join(f.root, "summary.md"), "utf8"),
    /Result: \*\*compatible\*\*/
  );
});

test("a PR contract mismatch fails with a field path and cannot use server credentials as fallback", async (t) => {
  const f = await contractFixture(t);
  const spec = structuredClone(f.spec);
  spec.fixture["openapi.snapshot.json"].schemas.Used.type = "number";
  await writeFile(f.specFile, JSON.stringify(spec));
  const result = f.run("preflight-api-contract.mjs", {
    args: ["--target", f.targetFile],
    shimFetch: true,
    env: { TEST_FORBID_SSH: "1" }
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stderr,
    /API target a{40}: API contract differs: schemas Used at \/schemas\/Used\/type/
  );
  assert.doesNotMatch(await f.calls(), /^(ssh|gh) /m);
  assert.match(
    await readFile(join(f.root, "summary.md"), "utf8"),
    /Result: \*\*failed\*\*/
  );
});

test("transport timeouts retain their cause and remain failed rather than incompatible or successful", async (t) => {
  const f = await contractFixture(t);
  const timeout = new DOMException("request timed out", "TimeoutError");
  await assert.rejects(
    preflightApiContract({
      targetFile: f.targetFile,
      packageRoot: f.packageRoot,
      fetchSpec: async () => {
        throw timeout;
      }
    }),
    (error) => {
      assert.equal(error.cause, timeout);
      assert.match(error.message, /API target a{40}: request timed out/);
      return true;
    }
  );
});
