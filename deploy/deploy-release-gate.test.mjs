import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { buildConfig, packRelease } from "./release-artifact.mjs";

const sha = "a".repeat(40);
const identity = {
  repository: "LonelyFellas/tsz",
  sha,
  tree: "b".repeat(40),
  runId: 123,
  attempt: 1
};

// Exercise real entrypoints, archive verification and provenance. Only external IO is replaced.
async function run(component, scenario, approved = true) {
  const root = await mkdtemp(join(tmpdir(), "tsz-release-gate."));
  try {
    const bin = join(root, "bin");
    await mkdir(bin);
    await cp(new URL("./", import.meta.url), join(root, "deploy"), {
      recursive: true
    });
    await writeFile(join(root, ".node-version"), process.version.slice(1));
    const artifact = join(root, "fixture");
    await mkdir(artifact);
    const releaseId = `${sha}-ci-123-1-${component}`;
    await writeFile(
      join(artifact, "version.json"),
      JSON.stringify({ release_id: releaseId })
    );
    await writeFile(join(artifact, "index.html"), "artifact");
    if (component === "web") {
      await mkdir(join(artifact, "apps/web/public/font-licenses"), {
        recursive: true
      });
      await writeFile(
        join(artifact, "apps/web/public/font-licenses/Andika-OFL.txt"),
        "font license"
      );
    }
    const bundle = join(root, "bundle");
    await packRelease({
      component,
      artifact,
      output: bundle,
      identity,
      config: buildConfig(
        component,
        scenario === "auto-config" ? { DEPLOY_VOICE_EDITOR: "false" } : {}
      ),
      releaseId,
      checks: { entry: "passed", boot: "passed", sharp: "passed" }
    });
    if (scenario === "corrupt")
      await writeFile(join(bundle, "release.tar.gz"), "corrupt");
    if (scenario === "manifest-source") {
      const file = join(bundle, "release.json");
      const data = JSON.parse(await readFile(file));
      data.identity.sha = "c".repeat(40);
      await writeFile(file, JSON.stringify(data));
    }
    const zip = join(root, "package.zip");
    assert.equal(
      spawnSync("python3", [
        "-I",
        "-c",
        "import pathlib,sys,zipfile\nwith zipfile.ZipFile(sys.argv[2],'w') as z:\n for p in pathlib.Path(sys.argv[1]).iterdir(): z.write(p,p.name)",
        bundle,
        zip
      ]).status,
      0
    );
    const log = join(root, "calls");
    const phase = join(root, "phase");
    const script = async (name, body) =>
      writeFile(join(bin, name), `#!/bin/bash\nset -euo pipefail\n${body}\n`, {
        mode: 0o755
      });
    await script(
      "git",
      `case "$*" in
      'status --porcelain') ;;
      'rev-parse HEAD') echo ${sha} ;;
      'remote get-url origin') echo https://github.com/LonelyFellas/tsz.git ;;
      'ls-remote --exit-code origin refs/heads/main')
        if [[ '${scenario}' = main-* && -f '${phase}' ]]; then echo '${"c".repeat(40)} refs/heads/main'; else echo '${sha} refs/heads/main'; fi ;;
      'cat-file -e '*) ;;
      'rev-parse '*'^'{tree}) echo ${identity.tree} ;;
      'show '*) echo '${process.version.slice(1)}' ;;
      'archive --format=tar '*) tar -cf - -C '${root}' deploy .node-version ;;
      *) exit 91 ;;
    esac`
    );
    const record = {
      id: 9,
      name: `tsz-${component}-${sha}-attempt-1`,
      expired: scenario === "expired",
      workflow_run: { id: 123, head_sha: sha, head_branch: "main" }
    };
    await script(
      "gh",
      `case "$*" in
      *'/artifacts/9/zip') cat '${zip}'; [[ '${scenario}' != *-download ]] || touch '${phase}' ;;
      *'/artifacts?per_page=100') printf '%s' '${JSON.stringify([{ artifacts: scenario === "missing" ? [] : [record] }])}' ;;
      *) attempt=1; id=123; conclusion=success
        if [[ -f '${phase}' ]]; then
          case '${scenario}' in attempt-*) attempt=2;; run-*) id=124;; failure-*) conclusion=failure;; skipped-*) conclusion=skipped;; unknown-*) exit 0;; esac
        fi
        printf '%s\tcompleted\t%s\thttps://github.com/LonelyFellas/tsz/actions/runs/%s\t%s\t${sha}\tmain\n' "$id" "$conclusion" "$id" "$attempt" ;;
    esac`
    );
    await script("pnpm", `echo forbidden-build >> '${log}'; exit 98`);
    await script(
      "ssh",
      `printf 'ssh %s\n' "$*" >> '${log}'
      case "$*" in
        *'/usr/bin/node --version') echo '${process.version}' ;;
        *'mktemp -d '*) echo /opt/tsz-release-stage.ABC123 ;;
        *publish-compatible.sh*|*'rm -rf '*) ;;
        *) exit 92 ;;
      esac`
    );
    await script(
      "rsync",
      `printf 'rsync %s\n' "$*" >> '${log}'
      [[ '${scenario}' != *-upload ]] || touch '${phase}'
      if [[ '${component}' = web && "$*" = *'/artifact/ tshb-test:'* ]]; then
        args=("$@"); count=\${#args[@]}
        cp "\${args[count-2]}apps/web/public/font-licenses/Andika-OFL.txt" '${root}/uploaded-license'
      fi`
    );
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    for (const key of Object.keys(env))
      if (key.startsWith("DEPLOY_")) delete env[key];
    if (approved)
      Object.assign(env, {
        DEPLOY_EXPECTED_SHA: sha,
        DEPLOY_EXPECTED_CI_RUN_ID: "123",
        DEPLOY_EXPECTED_CI_RUN_ATTEMPT: "1",
        DEPLOY_EXPECTED_API_SHA: "d".repeat(40)
      });
    if (scenario === "stale") env.DEPLOY_EXPECTED_SHA = "c".repeat(40);
    if (scenario === "auto-config") env.DEPLOY_AUTO_CONFIG = "1";
    const result = spawnSync(
      "bash",
      [join(root, `deploy/deploy-${component}.sh`)],
      { env, encoding: "utf8", timeout: 20000 }
    );
    return {
      ...result,
      calls: await readFile(log, "utf8").catch(() => ""),
      license: await readFile(join(root, "uploaded-license"), "utf8").catch(
        () => undefined
      )
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runSmokeProbe(kind, scenario) {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    if (
      scenario === "drop-always" ||
      (scenario === "drop-first" && requests === 1)
    ) {
      request.socket.destroy();
      return;
    }
    response.statusCode =
      scenario === "bad-status" ? 503 : kind === "page" ? 200 : 401;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const script = await readFile(
      new URL("./publish-release.sh", import.meta.url),
      "utf8"
    );
    const line = script
      .split("\n")
      .find((value) =>
        kind === "page"
          ? value.startsWith("curl --noproxy '*'")
          : value.startsWith('code="$(curl --noproxy')
      );
    assert.ok(line);
    const port = server.address().port;
    const command = line
      .replace('--resolve "$host:443:127.0.0.1" ', "")
      .replace(/https:\/\/\$host/g, `http://127.0.0.1:${port}`);
    const result = await new Promise((resolve) => {
      const child = spawn(
        "bash",
        [
          "-c",
          `set -euo pipefail\napi_path=auth/me\n${command}\n${kind === "api" ? '[[ "$code" = 401 ]]' : ""}`
        ],
        {
          stdio: ["ignore", "pipe", "pipe"]
        }
      );
      let stderr = "";
      child.stderr.on("data", (data) => {
        stderr += data;
      });
      child.on("exit", (status) => resolve({ status, stderr }));
      child.on("error", (error) =>
        resolve({ status: -1, stderr: error.message })
      );
    });
    return { ...result, requests };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

for (const kind of ["page", "api"]) {
  test(`${kind}: reload smoke retries a dropped connection and still checks the status`, async () => {
    const result = await runSmokeProbe(kind, "drop-first");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.requests, 2);
  });
  for (const scenario of ["drop-always", "bad-status"]) {
    test(`${kind}: reload smoke rejects ${scenario} within the retry limit`, async () => {
      const result = await runSmokeProbe(kind, scenario);
      assert.notEqual(result.status, 0, result.stderr);
      assert.equal(result.requests, 4);
    });
  }
}

for (const component of ["admin", "web"]) {
  for (const approved of [true, false])
    test(`${component}: publish verified CI bytes without a local build (${approved})`, async () => {
      const result = await run(component, "stable", approved);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.calls, /ssh .*publish-compatible.sh/);
      if (approved) assert.match(result.calls, new RegExp("d{40}"));
      assert.doesNotMatch(result.calls, /forbidden-build/);
      if (component === "web") assert.equal(result.license, "font license");
    });
  for (const scenario of [
    "stale",
    "manifest-source",
    "missing",
    "expired",
    "corrupt",
    "main-download",
    "attempt-download",
    "run-download",
    "failure-download",
    "skipped-download",
    "unknown-download",
    "main-upload",
    "attempt-upload"
  ]) {
    test(`${component}: stop before publishing on ${scenario}`, async () => {
      const result = await run(component, scenario);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.doesNotMatch(result.calls, /ssh .*publish-release.sh/);
      if (!scenario.endsWith("-upload"))
        assert.doesNotMatch(result.calls, /mktemp|tshb-test:/);
      else assert.match(result.calls, /mktemp/);
    });
  }
}

test("admin: automatic deployment uses the verified package flags", async () => {
  const result = await run("admin", "auto-config");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.calls, /ssh .*publish-compatible.sh/);
});
