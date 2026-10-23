import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  readlink,
  lstat,
  symlink,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { archive, point, planPrune, applyPrune, prune } from "./releases.mjs";
import { pruneFrontend } from "./frontend-retention.mjs";

const DAY = 86400_000;
const NOW = Date.parse("2026-10-23T12:00:00Z");

async function fixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), "tsz-retention-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(path.join(base, "outside"));
  await writeFile(path.join(base, "outside/keep.txt"), "external backup");
  return base;
}

async function release(root, id, usedAt, names = [`${id}.js`]) {
  const dir = path.join(root, "releases", id);
  const component = path.basename(root);
  const assets = component === "admin" ? "assets" : "apps/web/.next/static";
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "shell.txt"), id);
  for (const name of names) {
    const file = path.join(dir, assets, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `bytes:${name}`);
  }
  await archive(root, dir, component, id, usedAt);
  return dir;
}

async function setup(base, component = "web") {
  const root = path.join(base, "tsz-releases", component);
  const current = await release(root, "active", NOW - 90 * DAY, [
    "active.js",
    "shared.js"
  ]);
  await release(root, "expired", NOW - 31 * DAY, [
    "expired.js",
    "chunks/expired.css",
    "shared.js"
  ]);
  await point(root, current);
  return root;
}

async function snapshot(root) {
  const result = {};
  for (const item of (await readdir(root, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name)
  )) {
    const file = path.join(root, item.name);
    result[item.name] = item.isSymbolicLink()
      ? { link: await readlink(file) }
      : item.isDirectory()
        ? await snapshot(file)
        : (await readFile(file)).toString("base64");
  }
  return result;
}

async function editRecord(root, id, edit) {
  const file = path.join(root, "history", `${id}.json`);
  const record = JSON.parse(await readFile(file, "utf8"));
  edit(record);
  await writeFile(file, JSON.stringify(record));
}

async function missing(file) {
  await assert.rejects(lstat(file), { code: "ENOENT" });
}

const text = (root, file) => readFile(path.join(root, file), "utf8");

async function retained(root, id) {
  assert.equal(await text(root, `releases/${id}/shell.txt`), id);
  assert.equal(JSON.parse(await text(root, `history/${id}.json`)).id, id);
}

async function removed(root, id) {
  await missing(path.join(root, "releases", id));
  await missing(path.join(root, "history", `${id}.json`));
}

test("planning is read-only; current, previous, recent and shared assets survive the 30-day boundary", async (t) => {
  const base = await fixture(t);
  const root = await setup(base);
  await release(root, "previous", NOW - 100 * DAY);
  await writeFile(path.join(root, "previous"), "previous\n");
  await release(root, "recent", NOW - 30 * DAY + 1);
  await release(root, "boundary", NOW - 30 * DAY, [
    "chunks/boundary.css",
    "shared.js"
  ]);
  await writeFile(
    path.join(root, "assets/unknown.partial"),
    "unfinished upload"
  );
  const before = await snapshot(base);

  const plan = await planPrune(root, NOW);
  assert.deepEqual(await snapshot(base), before);
  assert.deepEqual(await applyPrune(plan), {
    component: "web",
    releases: 2,
    assets: 3
  });

  for (const id of ["active", "previous", "recent"]) {
    await retained(root, id);
    assert.equal(await text(root, `assets/${id}.js`), `bytes:${id}.js`);
  }
  for (const id of ["expired", "boundary"]) await removed(root, id);
  for (const file of [
    "expired.js",
    "chunks/expired.css",
    "chunks/boundary.css"
  ])
    await missing(path.join(root, "assets", file));
  assert.equal(await text(root, "current/shell.txt"), "active");
  assert.equal(await text(root, "previous"), "previous\n");
  assert.equal(await text(root, "assets/shared.js"), "bytes:shared.js");
  assert.equal(await text(root, "assets/unknown.partial"), "unfinished upload");
  assert.equal(await text(base, "outside/keep.txt"), "external backup");
});

test("frontend pruning handles both components without previous and is safe to repeat", async (t) => {
  const base = await fixture(t);
  const roots = await Promise.all([setup(base, "web"), setup(base, "admin")]);
  assert.deepEqual(await pruneFrontend(base, NOW), [
    { component: "web", releases: 1, assets: 2 },
    { component: "admin", releases: 1, assets: 2 }
  ]);
  for (const root of roots) {
    await retained(root, "active");
    await removed(root, "expired");
    await missing(path.join(root, "assets/expired.js"));
    await missing(path.join(root, "assets/chunks/expired.css"));
    assert.equal(await text(root, "assets/shared.js"), "bytes:shared.js");
  }
  const after = await snapshot(base);
  assert.deepEqual(await pruneFrontend(base, NOW), [
    { component: "web", releases: 0, assets: 0 },
    { component: "admin", releases: 0, assets: 0 }
  ]);
  assert.deepEqual(await snapshot(base), after);
});

test("both components pass preflight before deletion and an unfinished transaction blocks pruning", async (t) => {
  for (const scenario of ["broken admin history", "unfinished transaction"]) {
    await t.test(scenario, async (t) => {
      const base = await fixture(t);
      const web = await setup(base, "web");
      const admin = await setup(base, "admin");
      if (scenario === "broken admin history")
        await writeFile(path.join(admin, "history/expired.json"), "{broken");
      else await mkdir(path.join(base, "tsz-frontend-transaction"));
      const before = await snapshot(base);

      await assert.rejects(pruneFrontend(base, NOW));
      assert.deepEqual(await snapshot(base), before);
      await retained(web, "expired");
      assert.equal(await text(web, "assets/expired.js"), "bytes:expired.js");
    });
  }
});

test("unsafe release metadata or paths reject pruning without changing any files", async (t) => {
  const scenarios = [
    [
      "malformed history",
      (root) => writeFile(path.join(root, "history/expired.json"), "{broken")
    ],
    [
      "missing previous history",
      async (root) => {
        await release(root, "previous", NOW - 100 * DAY);
        await writeFile(path.join(root, "previous"), "previous");
        await rm(path.join(root, "history/previous.json"));
      }
    ],
    [
      "non-numeric usedAt",
      (root) =>
        editRecord(root, "expired", (record) => {
          record.usedAt = String(NOW - 31 * DAY);
        })
    ],
    [
      "asset path traversal",
      (root) =>
        editRecord(root, "expired", (record) => {
          record.records["../../../outside/keep.txt"] =
            record.records["expired.js"];
        })
    ],
    [
      "current points outside releases",
      (root, base) => point(root, path.join(base, "outside"))
    ],
    [
      "asset symlink to an external file",
      async (root, base) => {
        await rm(path.join(root, "assets/expired.js"));
        await symlink(
          path.join(base, "outside/keep.txt"),
          path.join(root, "assets/expired.js")
        );
      }
    ],
    [
      "release symlink to an external directory",
      async (root, base) => {
        await rm(path.join(root, "releases/expired"), { recursive: true });
        await symlink(
          path.join(base, "outside"),
          path.join(root, "releases/expired")
        );
      }
    ],
    [
      "blank previous file",
      (root) => writeFile(path.join(root, "previous"), " \n")
    ],
    [
      "previous symlink",
      (root) =>
        symlink("releases/expired/shell.txt", path.join(root, "previous"))
    ],
    [
      "corrupt retained asset",
      (root) => writeFile(path.join(root, "assets/active.js"), "corrupt")
    ],
    [
      "missing retained asset",
      (root) => rm(path.join(root, "assets/active.js"))
    ],
    [
      "unrecorded release",
      (root) => mkdir(path.join(root, "releases/unrecorded"))
    ]
  ];
  for (const [name, damage] of scenarios) {
    await t.test(name, async (t) => {
      const base = await fixture(t);
      const root = await setup(base);
      await damage(root, base);
      const before = await snapshot(base);
      await assert.rejects(prune(root, NOW));
      assert.deepEqual(await snapshot(base), before);
      assert.equal(await text(base, "outside/keep.txt"), "external backup");
    });
  }
});

test("retry completes a partially deleted expired release while preserving retained references", async (t) => {
  const base = await fixture(t);
  const root = await setup(base);
  // Simulate interruption after an asset and release directory were deleted, before history.
  await rm(path.join(root, "assets/expired.js"));
  await rm(path.join(root, "releases/expired"), { recursive: true });
  assert.equal(
    JSON.parse(await text(root, "history/expired.json")).id,
    "expired"
  );
  assert.equal(
    await text(root, "assets/chunks/expired.css"),
    "bytes:chunks/expired.css"
  );

  assert.deepEqual(await prune(root, NOW), {
    component: "web",
    releases: 1,
    assets: 1
  });
  await removed(root, "expired");
  await missing(path.join(root, "assets/expired.js"));
  await missing(path.join(root, "assets/chunks/expired.css"));
  await retained(root, "active");
  assert.equal(await text(root, "assets/shared.js"), "bytes:shared.js");
  const after = await snapshot(base);
  assert.deepEqual(await prune(root, NOW), {
    component: "web",
    releases: 0,
    assets: 0
  });
  assert.deepEqual(await snapshot(base), after);
});
