import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("API lock protects publication and rejects busy or changed API", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-api-lock-"));
  try {
    const stage = join(root, "stage");
    const lock = join(root, "deploy.lock");
    const manifest = join(root, "api.json");
    const bin = join(root, "bin");
    await mkdir(stage);
    await mkdir(bin);
    await writeFile(join(bin, "systemctl"), "#!/bin/sh\nexit 0\n", {
      mode: 0o755
    });
    await writeFile(
      join(stage, "publish-release.sh"),
      `#!/bin/bash\n[[ -f '${lock}/owner' ]] || exit 3\nprintf ok > '${root}/published'\n`
    );
    const sha = "a".repeat(40);
    const data = {
      component: "api",
      source: {
        repository: "LonelyFellas/tsz-rust",
        remote_ref: "refs/heads/main",
        git_sha: sha
      }
    };
    await writeFile(manifest, JSON.stringify(data));
    let script = await readFile(
      new URL("./publish-compatible.sh", import.meta.url),
      "utf8"
    );
    script = script
      .replace(/^\[\[ "\$stage" =~.*$/m, ":")
      .replace("lock=/opt/tsz-rust/deploy.lock", `lock='${lock}'`)
      .replaceAll("/usr/bin/node", process.execPath)
      .replace("/opt/tsz-deploy-manifests/api.json", manifest);
    const wrapper = join(root, "wrapper.sh");
    await writeFile(wrapper, script);
    const run = () =>
      spawnSync("bash", [wrapper, stage, "web", sha], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        encoding: "utf8"
      });
    assert.equal(run().status, 0);
    assert.equal(await readFile(join(root, "published"), "utf8"), "ok");
    await rm(join(root, "published"));
    await mkdir(lock);
    assert.notEqual(run().status, 0);
    await rm(lock, { recursive: true });
    data.source.git_sha = "b".repeat(40);
    await writeFile(manifest, JSON.stringify(data));
    assert.notEqual(run().status, 0);
    await assert.rejects(readFile(join(root, "published")), { code: "ENOENT" });
    await assert.rejects(readFile(join(lock, "owner")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
