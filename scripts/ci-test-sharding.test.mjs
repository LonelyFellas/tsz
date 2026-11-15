import assert from "node:assert/strict";
import test from "node:test";
import { balanceTestFiles } from "./ci-test-sharding.mjs";
import CiTestSequencer from "./ci-test-sequencer.mjs";

test("long files are distributed across jobs without dropping or repeating inventory entries", () => {
  const costs = { a: 90, b: 80, c: 70, d: 20, e: 15, f: 10 };
  const files = Object.keys(costs);
  const groups = balanceTestFiles(files, 3, costs);
  assert.deepEqual(groups.flat().sort(), files);
  assert.ok(
    groups.every(
      (group) =>
        group.filter((file) => ["a", "b", "c"].includes(file)).length === 1
    )
  );
  const totals = groups.map((group) =>
    group.reduce((sum, file) => sum + costs[file], 0)
  );
  assert.ok(Math.max(...totals) - Math.min(...totals) <= 10);
  assert.deepEqual(balanceTestFiles([...files].reverse(), 3, costs), groups);
  assert.deepEqual(costs, { a: 90, b: 80, c: 70, d: 20, e: 15, f: 10 });
});

test("new files get a stable fallback and historical files outside the inventory cannot run", () => {
  const files = ["new-a", "new-b", "new-c", "new-d", "new-e"];
  const groups = balanceTestFiles(files, 3, { deleted: 9000 });
  assert.deepEqual(groups.flat().sort(), files);
  assert.deepEqual(
    groups.map((group) => group.length),
    [2, 2, 1]
  );
  assert.deepEqual(balanceTestFiles(files, 3, {}), groups);
});

test("invalid shard or timing data cannot silently omit work", () => {
  for (const count of [0, -1, 1.5, 3]) {
    assert.throws(() => balanceTestFiles(["a", "b"], count, {}), /shard count/);
  }
  assert.throws(() => balanceTestFiles(["a", "a"], 1, {}), /duplicate/);
  for (const duration of [0, -1, Infinity, NaN, "1000"]) {
    assert.throws(
      () => balanceTestFiles(["a"], 1, { a: duration }),
      /positive milliseconds/
    );
  }
});

test("the Vitest sequencer preserves specification identity and is independent of checkout path", async () => {
  const names = [
    "apps/admin/src/features/voices/VoiceLibrary.test.tsx",
    "apps/admin/src/pages/WordWizardV3.test.tsx",
    "apps/admin/src/new-a.test.tsx",
    "apps/admin/src/new-b.test.tsx",
    "apps/admin/src/new-c.test.tsx"
  ];
  const allocation = async (root) => {
    const files = names.map((name) => ({
      moduleId: `${root}/${name}`,
      project: { name: "admin" }
    }));
    const groups = [];
    for (let index = 1; index <= 3; index++) {
      const sequencer = new CiTestSequencer({
        config: { root, shard: { index, count: 3 } }
      });
      const selected = await sequencer.shard(files);
      assert.ok(selected.every((file) => files.includes(file)));
      groups.push(selected.map((file) => file.moduleId.slice(root.length + 1)));
    }
    assert.deepEqual(groups.flat().sort(), [...names].sort());
    return groups;
  };
  assert.deepEqual(
    await allocation("/repo"),
    await allocation("/other/checkout")
  );
});

test("non-Admin sharding keeps Vitest's default partition and outside paths are rejected", async () => {
  const files = ["a", "b"].map((name) => ({
    moduleId: `/repo/apps/web/${name}.test.tsx`,
    project: { name: "web" }
  }));
  const results = [];
  for (let index = 1; index <= 2; index++) {
    results.push(
      ...(await new CiTestSequencer({
        config: { root: "/repo", shard: { index, count: 2 } }
      }).shard(files))
    );
  }
  assert.equal(results.length, files.length);
  assert.equal(new Set(results).size, files.length);
  assert.ok(results.every((file) => files.includes(file)));
  const sequencer = new CiTestSequencer({
    config: { root: "/repo", shard: { index: 1, count: 1 } }
  });
  await assert.rejects(
    sequencer.shard([
      { moduleId: "/outside.test.ts", project: { name: "admin" } }
    ]),
    /outside the repository/
  );
});
