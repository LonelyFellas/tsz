import assert from "node:assert/strict";
import {
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

function runDeploy(value, synthesis) {
  const root = mkdtempSync(join(tmpdir(), "tsz-admin-flag-test."));
  try {
    mkdirSync(join(root, "deploy"));
    mkdirSync(join(root, "bin"));
    writeFileSync(
      join(root, "deploy/deploy-admin.sh"),
      readFileSync(new URL("./deploy-admin.sh", import.meta.url))
    );
    writeFileSync(
      join(root, "deploy/deploy-source.sh"),
      `
prepare_deploy_source() { DEPLOY_GIT_SHA=test; }
prepare_deploy_build_tree() { DEPLOY_BUILD_ROOT="$PWD"; }
remove_deploy_build_tree() { :; }
remove_nginx_stage() { :; }
run_sanitized_build() { printf '%s\\n' "$@" > "$TEST_CAPTURE"; exit 73; }
`
    );
    for (const name of ["git", "ssh"]) {
      writeFileSync(
        join(root, "bin", name),
        `#!/bin/sh\nprintf '%s\\n' '${process.version.replace(/^v/, "")}'\n`,
        { mode: 0o755 }
      );
    }
    // SSH 的 Node 版本带 v；git 的 .node-version 不带 v。
    writeFileSync(
      join(root, "bin/ssh"),
      `#!/bin/sh\nprintf '%s\\n' '${process.version}'\n`,
      { mode: 0o755 }
    );
    const capture = join(root, "build-args");
    const env = {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      TEST_CAPTURE: capture
    };
    delete env.DEPLOY_AZURE_PRONUNCIATION_INPUTS;
    if (synthesis !== undefined)
      env.DEPLOY_AZURE_PRONUNCIATION_INPUTS = synthesis;
    delete env.DEPLOY_VOICE_EDITOR;
    if (value !== undefined) env.DEPLOY_VOICE_EDITOR = value;
    const result = spawnSync("bash", [join(root, "deploy/deploy-admin.sh")], {
      env,
      encoding: "utf8"
    });
    return {
      ...result,
      args:
        result.status === 73 ? readFileSync(capture, "utf8").split("\n") : []
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [input, expected] of [
  [undefined, "true"],
  ["true", "true"],
  ["false", "false"]
]) {
  test(`admin rollout passes ${expected} to the sanitized build (${input ?? "default"})`, () => {
    const result = runDeploy(input);
    assert.equal(result.status, 73, result.stderr);
    assert.ok(result.args.includes(`VITE_VOICE_EDITOR=${expected}`));
    assert.ok(result.args.includes("VITE_ADMIN_TTS_MOCK=false"));
    assert.ok(result.args.includes("--mode"));
  });
}

test("invalid rollout flag fails before building or server writes", () => {
  const result = runDeploy("FALSE");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DEPLOY_VOICE_EDITOR 必须为 true 或 false/);
  assert.deepEqual(result.args, []);
});

for (const [input, expected] of [
  [undefined, "false"],
  ["false", "false"],
  ["true", "true"]
]) {
  test(`synthesis rollout passes ${expected} to sanitized build (${input ?? "default"})`, () => {
    const result = runDeploy(undefined, input);
    assert.equal(result.status, 73, result.stderr);
    assert.ok(
      result.args.includes(`VITE_AZURE_PRONUNCIATION_INPUTS=${expected}`)
    );
    assert.ok(result.args.includes("VITE_VOICE_EDITOR=true"));
    assert.ok(result.args.includes("VITE_VOICE_AUDIO_UPLOAD=true"));
  });
}
test("invalid synthesis flag fails before building or server writes", () => {
  const result = runDeploy(undefined, "TRUE");
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /DEPLOY_AZURE_PRONUNCIATION_INPUTS 必须为 true 或 false/
  );
  assert.deepEqual(result.args, []);
});
