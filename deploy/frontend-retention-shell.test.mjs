import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { archive, point } from "./releases.mjs";

// 真实脚本和文件操作；仅将系统目录改到 fixture，并替换 systemd 外部命令。
async function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), "tsz-retention-shell."));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const base = join(temp, "opt");
  const source = join(temp, "source");
  const bin = join(temp, "bin");
  const units = join(temp, "units");
  for (const dir of [base, source, bin, units]) mkdirSync(dir);
  for (const name of [
    "releases.mjs",
    "frontend-retention.mjs",
    "prune-frontend.sh",
    "install-frontend-retention.sh",
    "systemd"
  ]) {
    cpSync(new URL(`./${name}`, import.meta.url), join(source, name), {
      recursive: true
    });
  }
  for (const name of [
    "frontend-retention.mjs",
    "prune-frontend.sh",
    "install-frontend-retention.sh"
  ]) {
    const file = join(source, name);
    writeFileSync(
      file,
      readFileSync(file, "utf8")
        .replaceAll("/opt", base)
        .replaceAll("/etc/systemd/system", units)
        .replaceAll("/usr/bin/node", process.execPath)
    );
  }
  const command = (name, body) =>
    writeFileSync(
      join(bin, name),
      `#!/bin/bash\nset -euo pipefail\n${body}\n`,
      { mode: 0o755 }
    );
  command("flock", 'exit "${TEST_FLOCK_STATUS:-0}"');
  command("systemd-analyze", 'printf "%s\\n" "$*" >> "$TEST_STATE/verify"');
  command(
    "systemctl",
    `
printf '%s\n' "$*" >> "$TEST_STATE/calls"
if [[ "$1" = "\${TEST_FAIL_ON:-}" && ! -e "$TEST_STATE/failed" ]]; then
  touch "$TEST_STATE/failed"; exit 1
fi
case "$1" in
  is-enabled) test -f "$TEST_STATE/enabled" ;;
  is-active) test -f "$TEST_STATE/active" ;;
  enable) touch "$TEST_STATE/enabled" ;;
  disable) rm -f "$TEST_STATE/enabled" ;;
  start|restart) touch "$TEST_STATE/active" ;;
  stop) rm -f "$TEST_STATE/active" ;;
  daemon-reload) ;;
  *) exit 90 ;;
esac`
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    TEST_STATE: temp
  };
  for (const component of ["web", "admin"]) {
    const root = join(base, "tsz-releases", component);
    for (const [id, when] of [
      ["expired", 1],
      ["current", Date.now()]
    ]) {
      const release = join(root, "releases", id);
      const assets = join(
        release,
        component === "web" ? "apps/web/.next/static" : "assets"
      );
      mkdirSync(assets, { recursive: true });
      writeFileSync(join(assets, `${id}.js`), id);
      await archive(root, release, component, id, when);
    }
    await point(root, join(root, "releases", "current"));
  }
  const run = (script, extra = {}) =>
    spawnSync("bash", [join(source, script)], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 10000
    });
  return {
    temp,
    base,
    source,
    bin,
    units,
    env,
    run,
    toolRoot: join(base, "tsz-deploy-tools/frontend-retention")
  };
}

for (const [status, expected] of [
  ["75", 0],
  ["73", 73]
]) {
  test(`cleanup lock status ${status} never starts deletion`, async (t) => {
    const f = await fixture(t);
    const result = f.run("prune-frontend.sh", { TEST_FLOCK_STATUS: status });
    assert.equal(result.status, expected, result.stderr);
    for (const c of ["web", "admin"])
      assert.ok(
        existsSync(join(f.base, "tsz-releases", c, "releases/expired"))
      );
  });
}

test("cleanup entry keeps current while deleting expired releases on both sides", async (t) => {
  const f = await fixture(t);
  const result = f.run("prune-frontend.sh");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout).map((r) => r.releases),
    [1, 1]
  );
  for (const c of ["web", "admin"]) {
    assert.ok(existsSync(join(f.base, "tsz-releases", c, "releases/current")));
    assert.ok(!existsSync(join(f.base, "tsz-releases", c, "releases/expired")));
  }
});

test("installer enables timer without deleting releases; reinstall updates the complete toolset", async (t) => {
  const f = await fixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.run("install-frontend-retention.sh");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(existsSync(join(f.temp, "enabled")));
    assert.ok(existsSync(join(f.temp, "active")));
    for (const name of [
      "releases.mjs",
      "frontend-retention.mjs",
      "prune-frontend.sh"
    ])
      assert.equal(
        readFileSync(join(f.toolRoot, name), "utf8"),
        readFileSync(join(f.source, name), "utf8")
      );
    assert.equal(
      readFileSync(join(f.units, "tsz-frontend-retention.timer"), "utf8"),
      readFileSync(
        join(f.source, "systemd/tsz-frontend-retention.timer"),
        "utf8"
      )
    );
    assert.ok(existsSync(join(f.base, "tsz-releases/web/releases/expired")));
  }
});

for (const existing of [false, true]) {
  test(`failed timer activation restores ${existing ? "existing" : "absent"} installation`, async (t) => {
    const f = await fixture(t);
    if (existing) {
      mkdirSync(f.toolRoot, { recursive: true });
      writeFileSync(join(f.toolRoot, "old-tool"), "old");
      for (const unit of ["service", "timer"])
        writeFileSync(
          join(f.units, `tsz-frontend-retention.${unit}`),
          `old-${unit}`
        );
      writeFileSync(join(f.temp, "enabled"), "");
      writeFileSync(join(f.temp, "active"), "");
    }
    const result = f.run("install-frontend-retention.sh", {
      TEST_FAIL_ON: "restart"
    });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(f.temp, "enabled")), existing);
    assert.equal(existsSync(join(f.temp, "active")), existing);
    assert.equal(existsSync(f.toolRoot), existing);
    for (const unit of ["service", "timer"]) {
      const file = join(f.units, `tsz-frontend-retention.${unit}`);
      assert.equal(existsSync(file), existing);
      if (existing) assert.equal(readFileSync(file, "utf8"), `old-${unit}`);
    }
    if (existing)
      assert.equal(readFileSync(join(f.toolRoot, "old-tool"), "utf8"), "old");
    assert.ok(existsSync(join(f.base, "tsz-releases/web/releases/expired")));
  });
}

for (const phase of ["before-backup", "after-backup", "after-install"]) {
  test(`interruption ${phase} preserves the previous installation`, async (t) => {
    const f = await fixture(t);
    mkdirSync(f.toolRoot, { recursive: true });
    writeFileSync(join(f.toolRoot, "old-tool"), "old");
    for (const unit of ["service", "timer"])
      writeFileSync(
        join(f.units, `tsz-frontend-retention.${unit}`),
        `old-${unit}`
      );
    writeFileSync(join(f.temp, "enabled"), "");
    writeFileSync(join(f.temp, "active"), "");
    writeFileSync(
      join(f.bin, "mv"),
      `#!/bin/bash
set -euo pipefail
if [[ "$2" = */previous-tools && '${phase}' = before-backup ]]; then exit 1; fi
/bin/mv "$@"
if [[ ( "$2" = */previous-tools && '${phase}' = after-backup ) ||
      ( "$1" = */tools && '${phase}' = after-install ) ]]; then
  kill -TERM "$PPID"
fi
`,
      { mode: 0o755 }
    );
    const result = f.run("install-frontend-retention.sh");
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(f.toolRoot, "old-tool"), "utf8"), "old");
    for (const unit of ["service", "timer"])
      assert.equal(
        readFileSync(join(f.units, `tsz-frontend-retention.${unit}`), "utf8"),
        `old-${unit}`
      );
    assert.ok(existsSync(join(f.temp, "enabled")));
    assert.ok(existsSync(join(f.temp, "active")));
  });
}

for (const reason of [
  "transaction",
  "bad-history",
  "lock",
  "interrupted-install"
]) {
  test(`installer fails before changes on ${reason}`, async (t) => {
    const f = await fixture(t);
    if (reason === "transaction")
      writeFileSync(join(f.base, "tsz-frontend-transaction"), "pending");
    if (reason === "bad-history")
      writeFileSync(
        join(f.base, "tsz-releases/admin/history/current.json"),
        "broken"
      );
    if (reason === "interrupted-install")
      mkdirSync(
        join(f.base, "tsz-deploy-tools/.frontend-retention.interrupted"),
        { recursive: true }
      );
    const result = f.run(
      "install-frontend-retention.sh",
      reason === "lock" ? { TEST_FLOCK_STATUS: "75" } : {}
    );
    assert.notEqual(result.status, 0);
    assert.ok(!existsSync(f.toolRoot));
    assert.ok(!existsSync(join(f.units, "tsz-frontend-retention.timer")));
    assert.ok(!existsSync(join(f.temp, "calls")));
    assert.ok(existsSync(join(f.base, "tsz-releases/web/releases/expired")));
  });
}

test(
  "Linux flock excludes cleanup while the actual deployment lock is held",
  { skip: process.platform !== "linux" },
  async (t) => {
    const f = await fixture(t);
    rmSync(join(f.bin, "flock"));
    const lock = join(f.base, "tsz-frontend-deploy.lock");
    const holder = spawn(
      "bash",
      [
        "-c",
        'exec 9>"$1"; flock -n 9; printf ready; read -r release',
        "--",
        lock
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    t.after(() => holder.kill());
    await once(holder.stdout, "data");
    const blocked = f.run("prune-frontend.sh");
    assert.equal(blocked.status, 0, blocked.stderr);
    assert.match(blocked.stdout, /本次跳过/);
    assert.ok(existsSync(join(f.base, "tsz-releases/web/releases/expired")));
    const exit = once(holder, "exit");
    holder.stdin.end("release\n");
    await exit;
    const cleaned = f.run("prune-frontend.sh");
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.ok(!existsSync(join(f.base, "tsz-releases/web/releases/expired")));
  }
);
