import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  readlink,
  stat
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  buildConfig,
  packRelease,
  verifyRelease,
  selectArtifact
} from "./release-artifact.mjs";

const identity = {
  repository: "LonelyFellas/tsz",
  sha: "a".repeat(40),
  tree: "b".repeat(40),
  runId: 123,
  attempt: 2
};

test("build settings retain test mode, real APIs and explicit compatibility flags", () => {
  const config = buildConfig("admin", { DEPLOY_VOICE_EDITOR: "false" });
  assert.equal(config.mode, "test");
  assert.equal(config.env.VITE_VOICE_EDITOR, "false");
  assert.equal(config.env.VITE_ADMIN_WORDS_MOCK, "false");
  assert.equal(config.env.VITE_ADMIN_TTS_MOCK, "false");
  assert.throws(
    () => buildConfig("admin", { DEPLOY_SENTENCE_FORMATTING: "TRUE" }),
    /true or false/
  );
  assert.equal(
    buildConfig("web", {}).env.NEXT_PUBLIC_SITE_URL,
    "https://test.tianshengzhi.com"
  );
});

test("artifact discovery rejects missing, expired, ambiguous and wrong-run packages", () => {
  const item = {
    id: 9,
    name: `tsz-web-${identity.sha}-attempt-2`,
    expired: false,
    workflow_run: { id: 123, head_sha: identity.sha, head_branch: "main" }
  };
  assert.equal(selectArtifact([item], "web", identity).id, 9);
  assert.equal(
    selectArtifact([item], "web", { ...identity, attempt: 3 }).id,
    9
  );
  assert.throws(
    () => selectArtifact([item], "web", { ...identity, attempt: 1 }),
    /unique unexpired/
  );
  for (const items of [
    [],
    [item, item],
    [{ ...item, expired: true }],
    [{ ...item, workflow_run: { ...item.workflow_run, id: 124 } }]
  ]) {
    assert.throws(
      () => selectArtifact(items, "web", identity),
      /unique unexpired/
    );
  }
});

test("a published package binds bytes, source, attempt, config and verification", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tsz-release-package."));
  try {
    const artifact = path.join(root, "built");
    await mkdir(artifact);
    await writeFile(path.join(artifact, "index.html"), "<html>admin</html>");
    await mkdir(path.join(artifact, "dependencies"));
    await symlink("../index.html", path.join(artifact, "dependencies/entry"));
    const releaseId = `${identity.sha}-ci-123-2-admin`;
    await writeFile(
      path.join(artifact, "version.json"),
      JSON.stringify({ release_id: releaseId })
    );
    const bundle = path.join(root, "bundle");
    await packRelease({
      component: "admin",
      artifact,
      output: bundle,
      identity,
      config: buildConfig("admin", {}),
      releaseId,
      checks: { entry: "passed" }
    });
    const expected = {
      component: "admin",
      identity,
      config: buildConfig("admin", {})
    };
    const verified = await verifyRelease(
      bundle,
      expected,
      path.join(root, "extracted")
    );
    assert.equal((await stat(verified.artifact)).mode & 0o777, 0o755);
    assert.equal(
      (await stat(path.join(verified.artifact, "dependencies"))).mode & 0o777,
      0o755
    );
    assert.equal(
      await readFile(path.join(verified.artifact, "index.html"), "utf8"),
      "<html>admin</html>"
    );
    assert.equal(
      await readlink(path.join(verified.artifact, "dependencies/entry")),
      "../index.html"
    );
    await assert.rejects(
      verifyRelease(
        bundle,
        { ...expected, identity: { ...identity, attempt: 3 } },
        path.join(root, "wrong-attempt")
      ),
      /identity/
    );
    await assert.rejects(
      verifyRelease(
        bundle,
        {
          ...expected,
          config: buildConfig("admin", { DEPLOY_VOICE_EDITOR: "false" })
        },
        path.join(root, "wrong-config")
      ),
      /config/
    );
    const receiptPath = path.join(bundle, "release.json");
    const receipt = JSON.parse(await readFile(receiptPath));
    await writeFile(
      receiptPath,
      JSON.stringify({ ...receipt, status: "failed" })
    );
    await assert.rejects(
      verifyRelease(bundle, expected, path.join(root, "failed")),
      /verification/
    );
    await writeFile(receiptPath, JSON.stringify(receipt));
    await writeFile(path.join(bundle, "release.tar.gz"), "corrupt");
    await assert.rejects(
      verifyRelease(bundle, expected, path.join(root, "corrupt")),
      /digest/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded deployment commands preserve failure status and terminate on deadline", () => {
  const wrapper = new URL("./run-with-progress.py", import.meta.url).pathname;
  const failure = spawnSync(
    "python3",
    ["-I", wrapper, "5", "failure", process.execPath, "-e", "process.exit(7)"],
    { encoding: "utf8", timeout: 10000 }
  );
  assert.equal(failure.status, 7, failure.stderr);
  const timeout = spawnSync(
    "python3",
    [
      "-I",
      wrapper,
      "1",
      "deadline",
      process.execPath,
      "-e",
      "setInterval(() => {}, 1000)"
    ],
    { encoding: "utf8", timeout: 10000 }
  );
  assert.equal(timeout.status, 124, timeout.stderr);
  assert.match(timeout.stderr, /deadline: timed out/);
});

test("bounded commands stop descendants even when their leader exits first", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tsz-process-group."));
  const wrapper = new URL("./run-with-progress.py", import.meta.url).pathname;
  try {
    for (const normal of [true, false]) {
      const pidFile = path.join(root, `child-${normal}`);
      const child = `import signal,time,pathlib,os; signal.signal(signal.SIGTERM,signal.SIG_IGN); pathlib.Path(${JSON.stringify(pidFile)}).write_text(str(os.getpid())); time.sleep(60)`;
      const parent = `import subprocess,time,pathlib,sys
subprocess.Popen([sys.executable,'-I','-c',${JSON.stringify(child)}],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
while not pathlib.Path(${JSON.stringify(pidFile)}).exists(): time.sleep(0.01)
${normal ? "sys.exit(0)" : "time.sleep(60)"}
`;
      let pid;
      try {
        const result = spawnSync(
          "python3",
          ["-I", wrapper, "1", "descendant", "python3", "-I", "-c", parent],
          { encoding: "utf8", timeout: 15000 }
        );
        pid = Number(await readFile(pidFile, "utf8"));
        assert.equal(result.status, normal ? 0 : 124, result.stderr);
        const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], {
          encoding: "utf8"
        });
        assert.ok(
          !state.stdout.trim() || state.stdout.trim().startsWith("Z"),
          `descendant still running: ${pid} ${state.stdout}`
        );
      } finally {
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {}
        }
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archive extraction refuses path traversal, external links and link ancestors", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tsz-release-unpack."));
  try {
    for (const scenario of ["traversal", "symlink", "ancestor", "hardlink"]) {
      const archive = path.join(root, `${scenario}.tar.gz`);
      const create = spawnSync(
        "python3",
        [
          "-I",
          "-c",
          `import io,tarfile,sys
with tarfile.open(sys.argv[1], 'w:gz') as archive:
    item=tarfile.TarInfo('../escape' if sys.argv[2]=='traversal' else 'link')
    if sys.argv[2] in ('symlink','ancestor'):
        item.type=tarfile.SYMTYPE; item.linkname='../../escape' if sys.argv[2]=='symlink' else 'inside'
    elif sys.argv[2]=='hardlink':
        item.type=tarfile.LNKTYPE; item.linkname='outside'
    else: item.size=1
    archive.addfile(item,io.BytesIO(b'x') if item.size else None)
    if sys.argv[2]=='ancestor':
        child=tarfile.TarInfo('link/file'); child.size=1; archive.addfile(child,io.BytesIO(b'x'))
`,
          archive,
          scenario
        ],
        { encoding: "utf8" }
      );
      assert.equal(create.status, 0, create.stderr);
      const result = spawnSync(
        "python3",
        [
          "-I",
          new URL("./unpack-release.py", import.meta.url).pathname,
          "tar",
          archive,
          path.join(root, scenario)
        ],
        { encoding: "utf8" }
      );
      assert.notEqual(result.status, 0, scenario);
      assert.equal(result.error, undefined);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
