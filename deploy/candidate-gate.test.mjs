import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sha = "a".repeat(40);
const other = "b".repeat(40);
const record = (
  id = 123,
  attempt = 1,
  status = "completed",
  conclusion = "success"
) =>
  `${id}\t${status}\t${conclusion}\thttps://github.com/LonelyFellas/tsz/actions/runs/${id}\t${attempt}\t${sha}\tmain`;

async function checkpoint(t, overrides = {}, workflowShell = false) {
  const root = await mkdtemp(path.join(tmpdir(), "tsz-candidate-gate."));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  await mkdir(bin);
  const script = (name, body) =>
    writeFile(
      path.join(bin, name),
      `#!/bin/bash\nset -euo pipefail\nprintf '%s\\n' '${name} '"$*" >> "$TEST_CALLS"\n${body}\n`,
      { mode: 0o755 }
    );
  await script(
    "git",
    `case "$*" in
    'remote get-url origin') echo "\${TEST_ORIGIN:-https://github.com/LonelyFellas/tsz.git}" ;;
    'ls-remote --exit-code origin refs/heads/main')
      if [[ -e "$TEST_QUERY_DONE" ]]; then echo "\${TEST_RECHECK_SHA:-$TEST_MAIN_SHA}"; else echo "$TEST_MAIN_SHA"; fi
      exit "\${TEST_GIT_STATUS:-0}" ;;
    *) exit 91 ;;
  esac`
  );
  await script(
    "gh",
    `[[ "\${TEST_QUERY_FAIL:-0}" = 0 ]] || exit 17
    touch "$TEST_QUERY_DONE"
    printf '%s\\n' "$TEST_CI_RECORD"`
  );
  for (const name of ["ssh", "rsync", "pnpm", "node"])
    await script(name, "exit 98");
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("DEPLOY_")) delete env[key];
  Object.assign(env, {
    PATH: `${bin}:${process.env.PATH}`,
    DEPLOY_AUTO_SKIP_STALE: "1",
    DEPLOY_EXPECTED_SHA: sha,
    DEPLOY_EXPECTED_CI_RUN_ID: "123",
    DEPLOY_EXPECTED_CI_RUN_ATTEMPT: "1",
    TEST_MAIN_SHA: sha,
    TEST_CI_RECORD: record(),
    TEST_CALLS: path.join(root, "calls"),
    TEST_QUERY_DONE: path.join(root, "queried"),
    GITHUB_STEP_SUMMARY: path.join(root, "summary.md"),
    GITHUB_OUTPUT: path.join(root, "output"),
    ...overrides
  });
  let args = [
    "-c",
    'set -euo pipefail; source "$1"; deploy_candidate_checkpoint before-setup; echo current',
    "--",
    fileURLToPath(new URL("./deploy-source.sh", import.meta.url))
  ];
  if (workflowShell) {
    const workflow = await readFile(
      new URL("../.github/workflows/deploy-tshb-test.yml", import.meta.url),
      "utf8"
    );
    const gate = workflow
      .split("- name: Check deployment candidate\n")[1]
      .split("\n      - name:")[0];
    const source = gate
      .split("        run: |\n")[1]
      .split("\n")
      .map((line) => line.replace(/^          /, ""))
      .join("\n");
    // GitHub's implicit Linux shell is bash -e. Execute the actual workflow
    // block so its own strict flags, rather than the test harness, protect IO.
    args = ["-e", "-c", source];
  }
  const result = spawnSync("bash", args, {
    env,
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    timeout: 10000
  });
  return {
    ...result,
    calls: await readFile(env.TEST_CALLS, "utf8").catch(() => ""),
    summary: await readFile(env.GITHUB_STEP_SUMMARY, "utf8").catch(() => "")
  };
}

test("the actual workflow shell rejects a Git failure even after a valid different ref was printed", async (t) => {
  const result = await checkpoint(
    t,
    { TEST_MAIN_SHA: other, TEST_GIT_STATUS: "128" },
    true
  );
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /cannot read origin\/main for candidate check/);
  assert.doesNotMatch(result.stdout, /outcome=superseded/);
  assert.doesNotMatch(result.calls, /^(ssh|rsync|node|pnpm) /m);
});

test("the exact latest successful candidate continues without setup or remote IO", async (t) => {
  const result = await checkpoint(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "current\n");
  assert.doesNotMatch(result.calls, /^(ssh|rsync|node|pnpm) /m);
});

for (const [name, overrides, reason] of [
  ["main already moved", { TEST_MAIN_SHA: other }, "main-moved"],
  ["main moves during the CI query", { TEST_RECHECK_SHA: other }, "main-moved"],
  ["a newer run", { TEST_CI_RECORD: record(124) }, "ci-superseded"],
  [
    "a newer pending attempt",
    { TEST_CI_RECORD: record(123, 2, "in_progress", "-") },
    "ci-superseded"
  ],
  [
    "a newer failed run",
    { TEST_CI_RECORD: record(124, 1, "completed", "failure") },
    "ci-superseded"
  ]
]) {
  test(`${name}: records superseded and exits before setup/download/SSH`, async (t) => {
    const result = await checkpoint(t, overrides);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`outcome=superseded.*reason=${reason}`)
    );
    assert.doesNotMatch(result.stdout, /^current$/m);
    assert.match(result.summary, /Outcome: \*\*superseded\*\*/);
    assert.match(result.summary, /Remote writes: \*\*0\*\*/);
    assert.doesNotMatch(result.calls, /^(ssh|rsync|node|pnpm) /m);
  });
}

for (const [name, overrides] of [
  ["GitHub query failure", { TEST_QUERY_FAIL: "1" }],
  ["missing CI", { TEST_CI_RECORD: "" }],
  ["invalid main SHA", { TEST_MAIN_SHA: "main" }],
  ["invalid candidate", { DEPLOY_EXPECTED_SHA: "" }],
  [
    "wrong origin",
    {
      TEST_ORIGIN: "https://github.com/another/repository.git",
      TEST_MAIN_SHA: other
    }
  ],
  ["older run", { TEST_CI_RECORD: record(122) }],
  ["older attempt", { DEPLOY_EXPECTED_CI_RUN_ATTEMPT: "2" }],
  [
    "same failed tuple",
    { TEST_CI_RECORD: record(123, 1, "completed", "failure") }
  ],
  ["same pending tuple", { TEST_CI_RECORD: record(123, 1, "queued", "-") }],
  [
    "unknown conclusion on newer tuple",
    { TEST_CI_RECORD: record(124, 1, "completed", "unknown") }
  ],
  [
    "unknown status on newer tuple",
    { TEST_CI_RECORD: record(124, 1, "unknown", "-") }
  ],
  [
    "a stage already exists",
    { DEPLOY_REMOTE_STAGE_CREATED: "1", TEST_MAIN_SHA: other }
  ]
]) {
  test(`${name}: fails instead of reporting a harmless skip`, async (t) => {
    const result = await checkpoint(t, overrides);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /outcome=superseded|^current$/m);
    assert.doesNotMatch(result.calls, /^(ssh|rsync|node|pnpm) /m);
  });
}
