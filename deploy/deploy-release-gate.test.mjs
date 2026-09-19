import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const sha = "a".repeat(40);
// 真实入口/来源门/原生 manifest；仅 mock 外部 git/gh/ssh/rsync、构建与独立 boot。
// ssh/远端 rsync 全部只记录本地日志，绝不访问服务器。
function run(component, scenario, approved = true) {
  const root = mkdtempSync(join(tmpdir(), "tsz-release-gate."));
  const bin = join(root, "bin");
  mkdirSync(bin);
  cpSync(new URL("./", import.meta.url), join(root, "deploy"), {
    recursive: true
  });
  if (scenario === "manifest-source") {
    const provenance = join(root, "deploy/provenance.mjs");
    writeFileSync(
      provenance,
      readFileSync(provenance, "utf8").replace(
        "git_sha: gitSha,",
        `git_sha: '${"c".repeat(40)}',`
      )
    );
  }
  const source = join(root, "deploy/deploy-source.sh");
  writeFileSync(
    source,
    readFileSync(source, "utf8") +
      "\nverify_standalone_boot() { :; }\nstop_standalone_boot() { :; }\n"
  );
  const log = join(root, "calls");
  const phase = join(root, "phase");
  const script = (name, body) =>
    writeFileSync(
      join(bin, name),
      `#!/bin/bash\nset -euo pipefail\n${body}\n`,
      { mode: 0o755 }
    );
  script(
    "git",
    `case "$*" in
    'status --porcelain') ;;
    'rev-parse HEAD') echo ${sha} ;;
    'remote get-url origin') echo git@github.com:LonelyFellas/tsz.git ;;
    'ls-remote --exit-code origin refs/heads/main')
      if [[ '${scenario}' = main-* && -f '${phase}' ]]; then echo '${"c".repeat(40)} refs/heads/main'; else echo '${sha} refs/heads/main'; fi ;;
    'cat-file -e '*) ;;
    'rev-parse '*'^'{tree}) echo ${"b".repeat(40)} ;;
    'show '*) echo '${process.version.slice(1)}' ;;
    'archive --format=tar '*) tar -cf - -C '${root}' deploy ;;
    *) echo "unexpected git $*" >&2; exit 91 ;;
  esac`
  );
  script(
    "gh",
    `attempt=1; id=123; conclusion=success
    if [[ -f '${phase}' ]]; then
      case '${scenario}' in attempt-*) attempt=2;; run-*) id=124;; failure-*) conclusion=failure;; skipped-*) conclusion=skipped;; unknown-*) exit 0;; esac
    fi
    printf '%s\\tcompleted\\t%s\\thttps://github.com/LonelyFellas/tsz/actions/runs/%s\\t%s\\t${sha}\\tmain\\n' "$id" "$conclusion" "$id" "$attempt"`
  );
  script(
    "pnpm",
    `if [[ "$*" = install* ]]; then exit 0; fi
    mkdir -p apps/admin/dist apps/web/.next/standalone/apps/web apps/web/.next/static
    echo artifact > apps/admin/dist/index.html
    echo artifact > apps/web/.next/standalone/apps/web/server.js
    echo static > apps/web/.next/static/test.js
    [[ '${scenario}' != *-build ]] || touch '${phase}'`
  );
  script(
    "ssh",
    `printf 'ssh %s\\n' "$*" >> '${log}'
    case "$*" in
      *'/usr/bin/node --version') echo '${process.version}' ;;
      *'mktemp -d '*) echo /opt/tsz-release-stage.ABC123 ;;
      *publish-release.sh*|*'rm -rf '*) ;;
      *) exit 92 ;;
    esac`
  );
  script(
    "rsync",
    `printf 'rsync %s\\n' "$*" >> '${log}'
    if [[ "$*" = *tshb-test:* ]]; then
      [[ '${scenario}' != *-upload ]] || touch '${phase}'
    else
      args=("$@"); count=\${#args[@]}; cp -R "\${args[count-2]}." "\${args[count-1]}"
    fi`
  );
  try {
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    delete env.DEPLOY_EXPECTED_SHA;
    delete env.DEPLOY_EXPECTED_CI_RUN_ID;
    delete env.DEPLOY_EXPECTED_CI_RUN_ATTEMPT;
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
    let calls = "";
    try {
      calls = readFileSync(log, "utf8");
    } catch {}
    return { ...result, calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const component of ["admin", "web"]) {
  for (const approved of [true, false])
    test(`${component}: stable ${approved ? "approved tuple" : "legacy call"}`, () => {
      const result = run(component, "stable", approved);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.calls, /ssh .*publish-release.sh/);
    });
  for (const scenario of [
    "stale",
    "manifest-source",
    "main-build",
    "attempt-build",
    "run-build",
    "failure-build",
    "skipped-build",
    "unknown-build",
    "main-upload",
    "attempt-upload"
  ]) {
    test(`${component}: stop on ${scenario}`, () => {
      const result = run(component, scenario);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.doesNotMatch(result.calls, /ssh .*publish-release.sh/);
      if (!scenario.endsWith("-upload"))
        assert.doesNotMatch(result.calls, /mktemp|tshb-test:/);
      else assert.match(result.calls, /mktemp/);
      assert.match(
        result.stdout + result.stderr,
        /DEPLOY_EXPECTED_SHA|origin\/main advanced|latest CI run\/attempt changed|not completed\/success|no unique CI run|Expected values to be strictly deep-equal/
      );
    });
  }
}
