import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const metricsCli = join(repositoryRoot, "scripts", "ci-metrics.mjs");

function runMetrics(args, env = {}) {
  const child = spawn(process.execPath, [metricsCli, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      resolve({ code, signal, stdout, stderr })
    );
  });
}

test("O01: measured commands preserve success and failure exit codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-ci-metrics-"));
  const summary = join(root, "summary.md");
  try {
    const success = await runMetrics(
      ["run", "install", "--", process.execPath, "-e", "process.exit(0)"],
      { GITHUB_STEP_SUMMARY: summary }
    );
    assert.equal(success.code, 0);
    assert.match(success.stdout, /\[ci-metrics\].*install.*success/);

    const failure = await runMetrics(
      ["run", "lint", "--", process.execPath, "-e", "process.exit(7)"],
      { GITHUB_STEP_SUMMARY: summary }
    );
    assert.equal(failure.code, 7);
    assert.match(failure.stdout, /\[ci-metrics\].*lint.*failure/);

    const markdown = await readFile(summary, "utf8");
    assert.match(markdown, /CI phase `install`.*success.*\d+\.\d{2}s/);
    assert.match(markdown, /CI phase `lint`.*failure.*\d+\.\d{2}s/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("O02: summary write failures never hide the child result", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-ci-metrics-summary-"));
  try {
    const result = await runMetrics(
      ["run", "typecheck", "--", process.execPath, "-e", "process.exit(0)"],
      { GITHUB_STEP_SUMMARY: root }
    );
    assert.equal(result.code, 0);
    assert.match(result.stderr, /unable to append GitHub step summary/);
    assert.match(result.stdout, /\[ci-metrics\].*typecheck.*success/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("O03: artifact measurement includes hidden files and fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-ci-artifact-size-"));
  const artifact = join(root, "artifact");
  const summary = join(root, "summary.md");
  try {
    await mkdir(join(artifact, ".hidden"), { recursive: true });
    await writeFile(join(artifact, "visible.bin"), "1234");
    await writeFile(join(artifact, ".hidden", "blob.bin"), "123456");

    const measured = await runMetrics(
      ["artifact", "coverage-module", "required", artifact],
      { GITHUB_STEP_SUMMARY: summary }
    );
    assert.equal(measured.code, 0);
    assert.match(measured.stdout, /"bytes":10/);
    assert.match(await readFile(summary, "utf8"), /10 bytes/);

    const missing = await runMetrics([
      "artifact",
      "coverage-module",
      "required",
      join(root, "missing")
    ]);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /artifact path does not exist/);

    const optional = await runMetrics([
      "artifact",
      "failed-report",
      "optional",
      join(root, "missing")
    ]);
    assert.equal(optional.code, 0);
    assert.match(optional.stdout, /"bytes":0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("O04: cache metrics expose safe keys and reject summary injection", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-ci-cache-metric-"));
  const summary = join(root, "summary.md");
  try {
    const recorded = await runMetrics(
      [
        "cache",
        "turbo",
        "turbo-v2-Linux-X64-primary",
        "turbo-v2-Linux-X64-main",
        "false",
        "success"
      ],
      { GITHUB_STEP_SUMMARY: summary }
    );
    assert.equal(recorded.code, 0);
    assert.match(await readFile(summary, "utf8"), /Cache `turbo`.*partial/);

    const invalidLabel = await runMetrics([
      "cache",
      "turbo\ninjected",
      "key",
      "",
      "false",
      "success"
    ]);
    assert.equal(invalidLabel.code, 1);
    assert.match(invalidLabel.stderr, /invalid metric label/);

    const invalidKey = await runMetrics([
      "cache",
      "turbo",
      "key\ninjected",
      "",
      "false",
      "success"
    ]);
    assert.equal(invalidKey.code, 1);
    assert.match(invalidKey.stderr, /invalid cache key/);

    const restoreFailure = await runMetrics(
      ["cache", "pnpm", "pnpm-primary", "", "", "failure"],
      { GITHUB_STEP_SUMMARY: summary }
    );
    assert.equal(restoreFailure.code, 0);
    assert.match(restoreFailure.stdout, /"status":"error"/);
    assert.match(
      await readFile(summary, "utf8"),
      /Cache `pnpm`: \*\*error\*\*/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
