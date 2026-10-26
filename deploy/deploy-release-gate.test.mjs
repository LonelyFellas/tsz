import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
      config: buildConfig(component, {}),
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
        *publish-release.sh*|*'rm -rf '*) ;;
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
        DEPLOY_EXPECTED_CI_RUN_ATTEMPT: "1"
      });
    if (scenario === "stale") env.DEPLOY_EXPECTED_SHA = "c".repeat(40);
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

for (const component of ["admin", "web"]) {
  for (const approved of [true, false])
    test(`${component}: publish verified CI bytes without a local build (${approved})`, async () => {
      const result = await run(component, "stable", approved);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.calls, /ssh .*publish-release.sh/);
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
