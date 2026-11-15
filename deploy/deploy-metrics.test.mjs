import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { remoteMetrics } from "./deploy-metrics.mjs";

const helper = new URL("./deploy-metrics.sh", import.meta.url).pathname;
const cli = new URL("./deploy-metrics.mjs", import.meta.url).pathname;

test("CLI timing works through a symlink and keeps captured API SHA and failure status intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-metrics-cli."));
  try {
    const link = join(root, "metrics.mjs");
    await symlink(cli, link);
    const init = spawnSync(process.execPath, [link, "init", "web", "local"], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
      encoding: "utf8"
    });
    assert.equal(init.status, 0, init.stderr);
    assert.match(init.stdout, /^\d+\n$/);
    for (const code of [0, 7]) {
      const result = spawnSync(
        process.execPath,
        [
          link,
          "run",
          "web",
          "local",
          "api-contract",
          "--",
          process.execPath,
          "-e",
          `process.stdout.write('fixed-sha'); process.exit(${code})`
        ],
        {
          env: {
            ...process.env,
            GITHUB_STEP_SUMMARY: join(root, "summary.md")
          },
          encoding: "utf8"
        }
      );
      assert.equal(result.status, code, result.stderr);
      assert.equal(result.stdout, "fixed-sha");
      assert.match(
        result.stderr,
        new RegExp(`"status":"${code === 0 ? "success" : "failure"}"`)
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("phase timing preserves command stdout and errexit, including failure and total", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-deploy-metrics."));
  try {
    const summary = join(root, "summary.md");
    const result = spawnSync(
      "bash",
      [
        "-c",
        `set -euo pipefail
source "$1"
deploy_metrics_init web local
trap 'deploy_metrics_finish "$?"' EXIT
deploy_phase download
printf 'unchanged\\0stdout'
deploy_phase verify
false
printf 'must not run'
`,
        "bash",
        helper
      ],
      {
        env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
        encoding: "utf8"
      }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "unchanged\0stdout");
    const records = result.stderr
      .split("\n")
      .filter((line) => line.startsWith("[deploy-metrics] {"))
      .map((line) => JSON.parse(line.slice("[deploy-metrics] ".length)));
    assert.deepEqual(
      records.map(({ phase, status }) => [phase, status]),
      [
        ["download", "success"],
        ["verify", "failure"],
        ["total", "failure"]
      ]
    );
    assert.ok(records.every((record) => record.duration_ms >= 0));
    assert.ok(records.at(-1).duration_ms >= records[0].duration_ms);
    assert.match(await readFile(summary, "utf8"), /verify \| failure/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unwritable summary never masks the command result", () => {
  const result = spawnSync(
    "bash",
    [
      "-c",
      `set -euo pipefail
source "$1"
deploy_metrics_init admin local
trap 'deploy_metrics_finish "$?"' EXIT
deploy_phase upload
exit 23
`,
      "bash",
      helper
    ],
    {
      env: { ...process.env, GITHUB_STEP_SUMMARY: "/dev/null/summary" },
      encoding: "utf8"
    }
  );
  assert.equal(result.status, 23, result.stderr);
  assert.match(result.stderr, /unable to append/);
  assert.match(result.stderr, /"phase":"upload","status":"failure"/);
});

test("remote timing accepts only matching structured metrics and safe summary fields", async () => {
  const metric = {
    type: "phase",
    component: "web",
    scope: "remote",
    phase: "smoke",
    status: "success",
    duration_ms: 123
  };
  const line = (value) => `[deploy-metrics] ${JSON.stringify(value)}`;
  const source = [
    "ordinary remote output",
    line(metric),
    line({
      ...metric,
      type: "milestone",
      phase: "verified-available",
      duration_ms: 456
    }),
    line({ ...metric, component: "admin" }),
    line({ ...metric, scope: "local" }),
    line({ ...metric, phase: "smoke\n| injected |" }),
    line({ ...metric, duration_ms: -1 }),
    "[deploy-metrics] {malformed"
  ].join("\n");
  const records = remoteMetrics(source, "web");
  assert.equal(records.length, 2);
  const root = await mkdtemp(join(tmpdir(), "tsz-remote-metrics."));
  try {
    const log = join(root, "remote.log");
    const summary = join(root, "summary.md");
    await writeFile(log, source);
    const result = spawnSync(process.execPath, [cli, "summary", "web", log], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    const text = await readFile(summary, "utf8");
    assert.match(text, /remote \| smoke \| success \| 0\.123s/);
    assert.match(text, /verified-available \(elapsed\)/);
    assert.doesNotMatch(text, /admin|injected|malformed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
