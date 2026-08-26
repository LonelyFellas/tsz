import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as prettier from "prettier";

const workflowUrl = new URL("../.github/workflows/ci.yml", import.meta.url);

function extractJobBlocks(source) {
  const jobsIndex = source.indexOf("\njobs:\n");
  assert.notEqual(jobsIndex, -1, "workflow must define jobs");
  const jobsSource = source.slice(jobsIndex + 1);
  const matches = [...jobsSource.matchAll(/^  ([a-z0-9-]+):\s*$/gm)];
  return new Map(
    matches.map((match, index) => [
      match[1],
      jobsSource.slice(
        match.index,
        matches[index + 1]?.index ?? jobsSource.length
      )
    ])
  );
}

async function workflowFixture() {
  const source = await readFile(workflowUrl, "utf8");
  return { source, jobs: extractJobBlocks(source) };
}

test("W01: workflow identity, triggers, permissions and concurrency stay stable", async () => {
  const { source } = await workflowFixture();
  assert.equal(await prettier.check(source, { parser: "yaml" }), true);
  assert.match(source, /^name: CI$/m);
  assert.match(source, /^  push:\n    branches: \[main\]$/m);
  assert.match(source, /^  pull_request:$/m);
  assert.match(source, /^permissions:\n  contents: read$/m);
  assert.match(
    source,
    /group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/
  );
  assert.match(
    source,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/
  );
});

test("W02: coverage matrix has five fixed modules and fail-fast disabled", async () => {
  const { jobs } = await workflowFixture();
  const block = jobs.get("unit-coverage");
  assert.ok(block);
  assert.match(block, /fail-fast: false/);
  for (const module of ["packages", "web", "admin-1", "admin-2", "admin-3"]) {
    assert.match(block, new RegExp(`module: ${module}(?:\\n|$)`));
  }
  assert.match(block, /pnpm ci:test-module/);
  assert.match(block, /actions\/upload-artifact@v7/);
  assert.match(block, /include-hidden-files: true/);
});

test("W03: coverage merge downloads, validates and merges every module", async () => {
  const { jobs } = await workflowFixture();
  const block = jobs.get("coverage-merge");
  assert.ok(block);
  assert.match(block, /needs: unit-coverage/);
  assert.match(block, /always\(\).*![ ]*cancelled\(\)/);
  assert.match(block, /actions\/download-artifact@v7/);
  assert.match(block, /pattern: vitest-blob-\*/);
  assert.match(block, /pnpm ci:validate-test-inventories/);
  assert.match(block, /--merge-reports=.*--coverage/);
});

test("W04: verify is a fail-closed stable summary", async () => {
  const { jobs } = await workflowFixture();
  const block = jobs.get("verify");
  assert.ok(block);
  for (const dependency of [
    "quality",
    "tooling-tests",
    "unit-coverage",
    "coverage-merge"
  ]) {
    assert.match(block, new RegExp(dependency));
  }
  assert.match(block, /if: \$\{\{ always\(\) \}\}/);
  assert.match(block, /QUALITY_RESULT/);
  assert.match(block, /COVERAGE_MERGE_RESULT/);
  assert.match(block, /!= "success"/);
});

test("W05: web and admin E2E run independently and converge", async () => {
  const { jobs } = await workflowFixture();
  assert.match(jobs.get("e2e-web"), /test:e2e:web/);
  assert.match(jobs.get("e2e-admin"), /test:e2e:admin/);
  const summary = jobs.get("e2e");
  assert.match(summary, /needs: \[e2e-web, e2e-admin\]/);
  assert.match(summary, /if: \$\{\{ always\(\) \}\}/);
  assert.match(summary, /WEB_E2E_RESULT/);
  assert.match(summary, /ADMIN_E2E_RESULT/);
  assert.match(summary, /!= "success"/);
});

test("W06: commitlint remains pull-request only", async () => {
  const { jobs } = await workflowFixture();
  const block = jobs.get("commitlint");
  assert.ok(block);
  assert.match(block, /if: github\.event_name == 'pull_request'/);
  assert.match(block, /pnpm commitlint/);
});
