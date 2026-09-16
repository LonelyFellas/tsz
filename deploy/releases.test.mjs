import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  rm,
  utimes
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { archive, bootstrap, point, prune } from "./releases.mjs";

test("A → B preserves every old static dependency, switches the complete shell, and supports rollback", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "tsz-releases-"));
  try {
    const root = path.join(temp, "admin");
    const legacy = path.join(temp, "legacy");
    await mkdir(path.join(legacy, "assets"), { recursive: true });
    for (const ext of ["js", "css", "woff2", "png"])
      await writeFile(path.join(legacy, "assets", `a.${ext}`), ext);
    await writeFile(path.join(legacy, "index.html"), "A");
    await bootstrap(root, legacy, "admin");
    assert.equal(
      await readFile(path.join(root, "current/index.html"), "utf8"),
      "A"
    );
    const next = path.join(root, "releases", "B");
    await mkdir(path.join(next, "assets"), { recursive: true });
    await writeFile(path.join(next, "index.html"), "B");
    await writeFile(path.join(next, "assets/b.js"), "B");
    await archive(root, next, "admin", "B");
    await point(root, next);
    assert.equal(
      await readFile(path.join(root, "current/index.html"), "utf8"),
      "B"
    );
    for (const ext of ["js", "css", "woff2", "png"])
      assert.equal(
        await readFile(path.join(root, "assets", `a.${ext}`), "utf8"),
        ext
      );
    await writeFile(path.join(root, "previous"), "legacy");
    await prune(root, Date.now() + 31 * 86400_000);
    assert.equal(await readFile(path.join(root, "assets/a.js"), "utf8"), "js");
    await point(root, path.join(root, "releases/legacy"));
    assert.equal(
      await readFile(path.join(root, "current/index.html"), "utf8"),
      "A"
    );
    assert.equal(await readFile(path.join(legacy, "index.html"), "utf8"), "A");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("collision fails before activation; expiry uses release references, not old build timestamps", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tsz-assets-"));
  try {
    const make = async (id, body) => {
      const dir = path.join(root, "releases", id);
      await mkdir(path.join(dir, "assets"), { recursive: true });
      await writeFile(path.join(dir, "assets", `${id}.js`), body);
      return dir;
    };
    const a = await make("A", "A");
    await utimes(path.join(a, "assets/A.js"), new Date(0), new Date(0));
    await archive(root, a, "admin", "A", 1);
    await point(root, a);
    const b = await make("B", "B");
    await archive(root, b, "admin", "B", Date.now());
    await point(root, b);
    await prune(root);
    await assert.rejects(readFile(path.join(root, "assets/A.js")), {
      code: "ENOENT"
    });
    await writeFile(path.join(b, "assets/B.js"), "corrupt");
    await assert.rejects(archive(root, b, "admin", "B"), /collision/);
    assert.equal(await readFile(path.join(root, "assets/B.js"), "utf8"), "B");
    assert.equal(await readlink(path.join(root, "current")), b);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
