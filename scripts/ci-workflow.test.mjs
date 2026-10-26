import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as prettier from "prettier";

const workflowUrl = new URL("../.github/workflows/ci.yml", import.meta.url);
const setupActionUrl = new URL(
  "../.github/actions/setup-node-pnpm/action.yml",
  import.meta.url
);
const turboUrl = new URL("../turbo.json", import.meta.url);

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
  // main 的 push 事件偶发不触发 CI 时靠它补跑，否则部署门禁找不到精确 SHA 的运行。
  assert.match(source, /^  workflow_dispatch:$/m);
  assert.match(source, /voice_editor:\n\s+type: boolean/);
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

test("deploy packages are built once on matching Linux and published per attempt", async () => {
  const { jobs } = await workflowFixture();
  const quality = jobs.get("quality");
  assert.match(quality, /runs-on: ubuntu-22\.04/);
  assert.match(quality, /if: github\.ref != 'refs\/heads\/main'/);
  assert.match(quality, /release-artifact\.mjs build web/);
  assert.match(quality, /release-artifact\.mjs build admin/);
  assert.match(
    quality,
    /name: tsz-web-\$\{\{ github.sha \}\}-attempt-\$\{\{ github.run_attempt \}\}/
  );
  assert.match(
    quality,
    /name: tsz-admin-\$\{\{ github.sha \}\}-attempt-\$\{\{ github.run_attempt \}\}/
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
  assert.ok(
    block.includes(
      "${{ github.event_name == 'pull_request' && 'test' || 'coverage' }}"
    )
  );
  assert.match(block, /actions\/upload-artifact@v7/);
  // 重跑后各 attempt 的同名产物并存，名字不带 attempt 就分不出新旧。
  assert.match(
    block,
    /name: vitest-blob-\$\{\{ matrix\.module \}\}-attempt-\$\{\{ github\.run_attempt \}\}/
  );
  assert.match(block, /include-hidden-files: true/);
});

test("W03: coverage merge downloads, picks latest attempts, validates and merges every module", async () => {
  const { jobs } = await workflowFixture();
  const block = jobs.get("coverage-merge");
  assert.ok(block);
  assert.match(block, /needs: unit-coverage/);
  assert.match(block, /always\(\).*![ ]*cancelled\(\)/);
  assert.match(block, /actions\/download-artifact@v8/);
  assert.match(block, /pattern: vitest-blob-\*/);
  // 合并下载会把同一模块多个 attempt 的产物解压进同一目录互相覆盖。
  assert.doesNotMatch(block, /merge-multiple/);
  const collectIndex = block.indexOf("pnpm ci:collect-test-artifacts");
  assert.notEqual(collectIndex, -1);
  assert.ok(collectIndex < block.indexOf("pnpm ci:validate-test-inventories"));
  assert.match(block, /pnpm ci:validate-test-inventories/);
  assert.match(block, /--merge-reports=.*--coverage/);
  assert.match(
    block,
    /- name: Merge coverage report\n        if: github\.event_name != 'pull_request'/
  );
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
  const admin = jobs.get("e2e-admin");
  assert.match(admin, /apt-get install[^\n]*fonts-noto-cjk/);
  assert.ok(
    admin.indexOf("Install Chinese fonts") < admin.indexOf("- name: Admin E2E")
  );
  assert.match(admin, /fc-match[^\n]*lang=zh-cn[^\n]*Noto Sans CJK/);
  const summary = jobs.get("e2e");
  assert.match(summary, /needs: \[e2e-web, e2e-admin\]/);
  assert.match(summary, /if: \$\{\{ always\(\) \}\}/);
  assert.match(summary, /WEB_E2E_RESULT/);
  assert.match(summary, /ADMIN_E2E_RESULT/);
  assert.match(summary, /!= "success"/);
});

test("web excludes every admin E2E file and admin includes each exactly once", async () => {
  const [web, admin, files] = await Promise.all([
    readFile(new URL("../e2e/playwright.config.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../e2e/playwright.admin.config.ts", import.meta.url),
      "utf8"
    ),
    readdir(new URL("../e2e/tests/", import.meta.url))
  ]);
  const entries = (source, key) => {
    const block = source.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`));
    assert.ok(block, `${key} must be explicit`);
    return [...block[1].matchAll(/"([^"]+\.spec\.ts)"/g)].map(
      (match) => match[1]
    );
  };
  const expected = files
    .filter((file) => /^admin-.*\.spec\.ts$/.test(file))
    .sort();
  assert.deepEqual(entries(admin, "testMatch").sort(), expected);
  assert.deepEqual(entries(web, "testIgnore").sort(), expected);
});

test("W06: commitlint remains pull-request only", async () => {
  const { jobs } = await workflowFixture();
  const block = jobs.get("commitlint");
  assert.ok(block);
  assert.match(block, /if: github\.event_name == 'pull_request'/);
  assert.match(block, /pnpm commitlint/);
});

test("W07: pnpm cache is explicit, content-addressed and store-only", async () => {
  const source = await readFile(setupActionUrl, "utf8");
  assert.equal(await prettier.check(source, { parser: "yaml" }), true);
  assert.match(source, /pnpm\/action-setup@v6/);
  assert.match(source, /actions\/setup-node@v7/);
  assert.match(source, /actions\/cache\/restore@v6/);
  for (const fingerprint of [
    "runner.os",
    "runner.arch",
    "hashFiles('.nvmrc')",
    "hashFiles('package.json')",
    "hashFiles('pnpm-lock.yaml')"
  ]) {
    assert.ok(source.includes(fingerprint), `missing pnpm key: ${fingerprint}`);
  }
  assert.match(source, /pnpm store path --silent/);
  assert.match(source, /continue-on-error: true/);
  assert.match(source, /steps\.cache\.outcome == 'failure'/);
  assert.match(source, /npm_config_store_dir/);
  assert.match(source, /RUNNER_TEMP/);
  assert.match(source, /restore-outcome/);
  assert.ok(
    source.indexOf("Isolate failed pnpm restore") <
      source.indexOf("Record pnpm cache")
  );
  assert.doesNotMatch(source, /node_modules/);
  assert.doesNotMatch(source, /actions\/cache\/save@/);
});

test("W08: Turbo cache restores everywhere but saves only from trusted main", async () => {
  const { jobs } = await workflowFixture();
  const quality = jobs.get("quality");
  assert.match(quality, /\.\/\.github\/actions\/setup-node-pnpm/);
  assert.match(quality, /actions\/cache\/restore@v6/);
  assert.match(quality, /actions\/cache\/save@v6/);
  assert.match(quality, /turbo-v2-/);
  assert.match(quality, /runner\.os/);
  assert.match(quality, /runner\.arch/);
  assert.match(quality, /hashFiles\('\.nvmrc'\)/);
  assert.match(quality, /hashFiles\('package\.json'\)/);
  assert.match(quality, /hashFiles\('pnpm-lock\.yaml'\)/);
  assert.match(quality, /steps\.turbo-cache\.outcome == 'failure'/);
  assert.match(quality, /rmSync\("\.turbo"/);
  assert.ok(
    quality.indexOf("Reset incomplete turbo restore") <
      quality.indexOf("- name: Lint")
  );
  assert.doesNotMatch(quality, /restore-keys:\s*\|\s*\n\s+turbo-\s*$/m);
});

test("W09: Playwright cache is architecture-safe and never skips browser fallback", async () => {
  const { jobs } = await workflowFixture();
  for (const jobName of ["e2e-web", "e2e-admin"]) {
    const block = jobs.get(jobName);
    assert.match(block, /actions\/cache\/restore@v6/);
    assert.match(block, /playwright-v2-/);
    assert.match(block, /runner\.os/);
    assert.match(block, /runner\.arch/);
    assert.match(block, /steps\.pw\.outputs\.version/);
    assert.match(block, /continue-on-error: true/);
    assert.match(block, /steps\.pw-cache\.outcome == 'failure'/);
    assert.match(block, /PLAYWRIGHT_BROWSERS_PATH/);
    assert.match(block, /RUNNER_TEMP/);
    assert.ok(
      block.indexOf("Isolate failed Playwright restore") <
        block.indexOf("Ensure Playwright browsers")
    );
    assert.match(block, /playwright install chromium/);
    assert.doesNotMatch(
      block,
      /if:.*pw-cache\.outputs\.cache-hit[^\n]*\n\s+run:.*playwright install/s
    );
  }
  assert.match(jobs.get("e2e-web"), /actions\/cache\/save@v6/);
  assert.doesNotMatch(jobs.get("e2e-admin"), /actions\/cache\/save@v6/);
});

test("Playwright dependency timeouts can terminate privileged installers", async () => {
  const { jobs } = await workflowFixture();
  for (const name of ["e2e-web", "e2e-admin"]) {
    const block = jobs.get(name);
    assert.match(
      block,
      /sudo timeout --kill-after=15s 180 env "PATH=\$PATH" pnpm --filter @tsz\/e2e exec playwright install-deps chromium/
    );
    assert.doesNotMatch(block, /if timeout 240 pnpm/);
  }
  const admin = jobs.get("e2e-admin");
  assert.match(
    admin,
    /apt-get install[^\n]*-o DPkg::Lock::Timeout=120[^\n]*fonts-noto-cjk/
  );
  assert.match(admin, /fc-match[^\n]*lang=zh-cn[^\n]*Noto Sans CJK/);
});

test("APT downloads leave time for E2E and required fonts still fail closed", async () => {
  const { jobs } = await workflowFixture();
  for (const name of ["e2e-web", "e2e-admin"]) {
    const block = jobs.get(name);
    const setup = block.slice(
      block.indexOf("- name: Configure APT downloads"),
      block.indexOf("- name: Install Playwright system deps")
    );
    assert.match(setup, /https:\/\/archive\.ubuntu\.com\/ubuntu\//);
    assert.match(setup, /Acquire::http::Timeout "30"/);
    assert.match(setup, /Acquire::https::Timeout "30"/);
    assert.match(setup, /Acquire::Retries "2"/);
    const deps = block.slice(
      block.indexOf("- name: Install Playwright system deps")
    );
    assert.match(deps, /for i in 1 2; do/);
    assert.doesNotMatch(deps, /for i in 1 2 3; do/);
  }
  const admin = jobs.get("e2e-admin");
  const fonts = admin.slice(
    admin.indexOf("- name: Install Chinese fonts"),
    admin.indexOf("- name: Admin E2E")
  );
  assert.match(fonts, /sudo timeout --kill-after=15s 120 sh -c/);
  assert.match(fonts, /for i in 1 2; do/);
  assert.match(fonts, /fc-match[^\n]*lang=zh-cn[^\n]*Noto Sans CJK/);
  assert.match(fonts, /exit 1/);
  assert.doesNotMatch(fonts, /continue-on-error/);
  assert.match(admin, /timeout-minutes: 20/);
});

test("font installation retries are bounded and missing fonts fail the step", async (t) => {
  const { jobs } = await workflowFixture();
  const admin = jobs.get("e2e-admin");
  const step = admin.slice(
    admin.indexOf("- name: Install Chinese fonts"),
    admin.indexOf("- name: Admin E2E")
  );
  const script = step
    .slice(step.indexOf("run: |") + "run: |".length)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
  const dir = await mkdtemp(join(tmpdir(), "ci-font-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, "sudo"),
    `#!/bin/sh
count=$(wc -l < "$CALLS_FILE")
printf 'attempt\\n' >> "$CALLS_FILE"
[ "$count" -ge "$FAIL_COUNT" ]
`,
    { mode: 0o755 }
  );
  await writeFile(join(dir, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(
    join(dir, "fc-match"),
    '#!/bin/sh\nprintf "%s\\n" "$FONT_FAMILY"\n',
    { mode: 0o755 }
  );
  for (const [failCount, font, expectedStatus, attempts] of [
    [1, "Noto Sans CJK SC", 0, 2],
    [2, "Noto Sans CJK SC", 1, 2],
    [0, "DejaVu Sans", 1, 1]
  ]) {
    const calls = join(dir, "calls");
    await writeFile(calls, "");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CALLS_FILE: calls,
        FAIL_COUNT: String(failCount),
        FONT_FAMILY: font
      }
    });
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.equal(
      (await readFile(calls, "utf8")).trim().split("\n").length,
      attempts
    );
  }
});

test("W10: only trusted successful main pushes can write caches", async () => {
  const { source } = await workflowFixture();
  const saveIndexes = [
    ...source.matchAll(/uses: actions\/cache\/save@v6/g)
  ].map((match) => match.index);
  assert.equal(saveIndexes.length, 3);
  for (const index of saveIndexes) {
    const context = source.slice(Math.max(0, index - 500), index);
    for (const guard of [
      "success()",
      "github.event_name == 'push'",
      "github.ref == 'refs/heads/main'",
      "github.repository == 'LonelyFellas/tsz'",
      "outcome == 'success'"
    ]) {
      assert.ok(context.includes(guard), `cache save missing guard: ${guard}`);
    }
  }
  assert.doesNotMatch(source, /uses: actions\/cache@v6/);
});

test("W11: cache outcomes never skip quality, coverage or E2E gates", async () => {
  const { jobs } = await workflowFixture();
  const requiredSteps = [
    ["quality", ["Lint", "Typecheck", "Format check", "Build"]],
    ["unit-coverage", ["Run test module"]],
    [
      "coverage-merge",
      ["Verify every test file ran exactly once", "Merge coverage report"]
    ],
    ["e2e-web", ["Web E2E"]],
    ["e2e-admin", ["Admin E2E"]]
  ];
  for (const [jobName, stepNames] of requiredSteps) {
    const block = jobs.get(jobName);
    for (const stepName of stepNames) {
      const marker = `- name: ${stepName}`;
      const start = block.indexOf(marker);
      assert.notEqual(start, -1, `${jobName} missing ${stepName}`);
      const end = block.indexOf("\n      - name:", start + marker.length);
      const step = block.slice(start, end === -1 ? block.length : end);
      assert.doesNotMatch(step, /cache-hit/);
      assert.doesNotMatch(step, /continue-on-error/);
    }
  }
});

test("W12: workflow exposes phase, cache and artifact metrics", async () => {
  const { source, jobs } = await workflowFixture();
  const setupAction = await readFile(setupActionUrl, "utf8");
  assert.match(source, /node scripts\/ci-metrics\.mjs run/);
  assert.match(`${source}\n${setupAction}`, /ci-metrics\.mjs"? cache/);
  assert.match(source, /node scripts\/ci-metrics\.mjs artifact/);
  const unitCoverage = jobs.get("unit-coverage");
  assert.ok(
    unitCoverage.indexOf("Measure coverage module artifact") <
      unitCoverage.indexOf("Upload blob and actual-run inventory")
  );
});

test("C01: Turbo hashes build environment without caching tests", async () => {
  const turbo = JSON.parse(await readFile(turboUrl, "utf8"));
  assert.deepEqual(turbo.tasks.build.env, [
    "BACKEND_API_URL",
    "NEXT_PUBLIC_*",
    "VITE_*"
  ]);
  assert.equal(turbo.tasks.test, undefined);
});

test("S01: Phase 0/1 contains no promotion, remote cache or privileged trigger", async () => {
  const { source } = await workflowFixture();
  for (const forbidden of [
    "pull_request_target",
    "workflow_run",
    "TURBO_TOKEN",
    "TURBO_TEAM",
    "run-id:",
    "github-token:"
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `forbidden CI capability: ${forbidden}`
    );
  }
});
