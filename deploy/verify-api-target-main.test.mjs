import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  fetchBackendMainSha,
  verifyApiTargetMain
} from "./verify-api-target-main.mjs";

const sha = "a".repeat(40);

test("backend main SHA is parsed from the authoritative GitHub response", async () => {
  const result = await fetchBackendMainSha(async (url, options) => {
    assert.match(url, /github\.com\/.*\/commits\/main$/);
    assert.equal(options.headers.Accept, "application/vnd.github+json");
    return new Response(JSON.stringify({ sha }));
  });
  assert.equal(result, sha);
});

test("deployment target must match backend main", async () => {
  const root = await mkdtemp(join(process.cwd(), ".api-target-test-"));
  const targetFile = join(root, "api-target.json");
  await writeFile(
    targetFile,
    JSON.stringify({
      version: 1,
      environment: "tshb-test",
      repository: "LonelyFellas/tsz-rust",
      sha
    })
  );
  await assert.rejects(
    verifyApiTargetMain({
      targetFile,
      fetcher: async () => new Response(JSON.stringify({ sha: "b".repeat(40) }))
    }),
    /does not match backend main/
  );
  const result = await verifyApiTargetMain({
    targetFile,
    fetcher: async () => new Response(JSON.stringify({ sha }))
  });
  assert.equal(result.mainSha, sha);
  await rm(root, { recursive: true, force: true });
});
