import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  symlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acceptManifest,
  createCandidateManifest,
  digestDirectory,
  validateManifest,
  verifyManifest
} from "./provenance.mjs";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "tsz-provenance-"));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "nested", "b.txt"), "beta\n");
  await writeFile(path.join(root, "a.txt"), "alpha\n");
  await symlink("a.txt", path.join(root, "a-link"));
  return root;
}

function candidateInput(artifactRoot, outputPath, overrides = {}) {
  return {
    component: "web",
    repository: "LonelyFellas/tsz",
    gitSha: SHA,
    gitTree: TREE,
    ciRunId: 123456789,
    ciRunUrl: "https://github.com/LonelyFellas/tsz/actions/runs/123456789",
    artifactRoot,
    artifactPath: "/opt/tsz-web",
    outputPath,
    ...overrides
  };
}

test("N01: directory digest is independent of creation order", async (t) => {
  const first = await fixture();
  const second = await mkdtemp(path.join(tmpdir(), "tsz-provenance-order-"));
  t.after(async () => {
    await Promise.all([
      import("node:fs/promises").then(({ rm }) =>
        rm(first, { recursive: true })
      ),
      import("node:fs/promises").then(({ rm }) =>
        rm(second, { recursive: true })
      )
    ]);
  });

  await symlink("a.txt", path.join(second, "a-link"));
  await writeFile(path.join(second, "a.txt"), "alpha\n");
  await mkdir(path.join(second, "nested"));
  await writeFile(path.join(second, "nested", "b.txt"), "beta\n");

  assert.deepEqual(await digestDirectory(first), await digestDirectory(second));
});

test("N02/N03: semantic changes alter digest while mtime does not", async (t) => {
  const root = await fixture();
  t.after(() =>
    import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true }))
  );

  const initial = await digestDirectory(root);
  await utimes(path.join(root, "a.txt"), new Date(1_000), new Date(2_000));
  assert.deepEqual(await digestDirectory(root), initial);

  await writeFile(path.join(root, "a.txt"), "changed\n");
  assert.notEqual((await digestDirectory(root)).sha256, initial.sha256);
});

test("N02: changing a symlink target alters digest", async (t) => {
  const root = await fixture();
  t.after(() =>
    import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true }))
  );
  const initial = await digestDirectory(root);

  const { rm } = await import("node:fs/promises");
  await rm(path.join(root, "a-link"));
  await symlink("nested/b.txt", path.join(root, "a-link"));
  assert.notEqual((await digestDirectory(root)).sha256, initial.sha256);
});

test("N02: changing a file path alters digest", async (t) => {
  const root = await fixture();
  t.after(() =>
    import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true }))
  );
  const initial = await digestDirectory(root);

  await rename(
    path.join(root, "nested", "b.txt"),
    path.join(root, "nested", "renamed.txt")
  );
  assert.notEqual((await digestDirectory(root)).sha256, initial.sha256);
});

test("N04: empty and special-node artifact roots fail closed", async (t) => {
  const empty = await mkdtemp(path.join(tmpdir(), "tsz-provenance-empty-"));
  const special = await mkdtemp(path.join(tmpdir(), "tsz-provenance-special-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(empty, { recursive: true });
    await rm(special, { recursive: true });
  });

  await assert.rejects(() => digestDirectory(empty), /empty/i);
  execFileSync("mkfifo", [path.join(special, "pipe")]);
  await assert.rejects(() => digestDirectory(special), /unsupported/i);
});

test("N05: final schema rejects missing, extra and malformed fields", async () => {
  const valid = {
    schema_version: 1,
    component: "web",
    source: {
      repository: "LonelyFellas/tsz",
      git_sha: SHA,
      git_tree: TREE,
      remote_ref: "refs/heads/main"
    },
    ci: {
      workflow: "CI",
      run_id: 123456789,
      run_url: "https://github.com/LonelyFellas/tsz/actions/runs/123456789",
      conclusion: "success"
    },
    artifact: {
      kind: "directory",
      path: "/opt/tsz-web",
      sha256: "c".repeat(64),
      file_count: 3,
      excluded_paths: ["apps/web/.next/cache"]
    },
    accepted_at: "2026-08-17T00:00:00.000Z"
  };

  assert.doesNotThrow(() => validateManifest(valid));
  assert.throws(
    () => validateManifest({ ...valid, extra: true }),
    /unexpected/i
  );
  assert.throws(
    () => validateManifest({ ...valid, component: "worker" }),
    /component/i
  );
  assert.throws(
    () =>
      validateManifest({
        ...valid,
        source: { ...valid.source, git_sha: "short" }
      }),
    /git_sha/i
  );
  assert.throws(
    () =>
      validateManifest({
        ...valid,
        ci: { ...valid.ci, conclusion: "failure" }
      }),
    /conclusion/i
  );
  assert.throws(
    () =>
      validateManifest({
        ...valid,
        ci: { ...valid.ci, run_url: "https://example.com/1" }
      }),
    /run_url/i
  );
  assert.throws(
    () =>
      validateManifest({
        ...valid,
        artifact: { ...valid.artifact, excluded_paths: [] }
      }),
    /excluded_paths/i
  );
  const { accepted_at: _acceptedAt, ...missing } = valid;
  assert.throws(() => validateManifest(missing), /accepted_at/i);
});

test("N08: fixed web runtime cache is excluded from the release digest", async (t) => {
  const root = await fixture();
  const cache = path.join(root, "apps", "web", ".next", "cache", "images");
  await mkdir(cache, { recursive: true });
  await writeFile(path.join(cache, "first"), "runtime cache\n");
  t.after(() =>
    import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true }))
  );

  const options = { excludedPaths: ["apps/web/.next/cache"] };
  const initial = await digestDirectory(root, options);
  await writeFile(path.join(cache, "second"), "changed at runtime\n");

  assert.deepEqual(await digestDirectory(root, options), initial);
  assert.notDeepEqual(await digestDirectory(root), initial);
});

test("N06: candidate acceptance creates a strict verifiable manifest", async (t) => {
  const root = await fixture();
  const outputDir = await mkdtemp(
    path.join(tmpdir(), "tsz-provenance-output-")
  );
  const candidatePath = path.join(outputDir, "candidate.json");
  const finalPath = path.join(outputDir, "web.json");
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true });
    await rm(outputDir, { recursive: true });
  });

  const candidate = await createCandidateManifest(
    candidateInput(root, candidatePath)
  );
  assert.equal(candidate.accepted_at, null);
  await acceptManifest({
    manifestPath: candidatePath,
    artifactRoot: root,
    outputPath: finalPath
  });

  const verified = await verifyManifest({
    manifestPath: finalPath,
    artifactRoot: root
  });
  assert.match(verified.accepted_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(verified.artifact.file_count, 3);
});

test("N07: artifact tampering fails and cannot overwrite an accepted manifest", async (t) => {
  const root = await fixture();
  const outputDir = await mkdtemp(
    path.join(tmpdir(), "tsz-provenance-tamper-")
  );
  const candidatePath = path.join(outputDir, "candidate.json");
  const finalPath = path.join(outputDir, "web.json");
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true });
    await rm(outputDir, { recursive: true });
  });

  await createCandidateManifest(candidateInput(root, candidatePath));
  await acceptManifest({
    manifestPath: candidatePath,
    artifactRoot: root,
    outputPath: finalPath
  });
  const acceptedBytes = await readFile(finalPath);

  await writeFile(path.join(root, "a.txt"), "tampered\n");
  await assert.rejects(
    () =>
      acceptManifest({
        manifestPath: candidatePath,
        artifactRoot: root,
        outputPath: finalPath
      }),
    /digest/i
  );
  await assert.rejects(
    () => verifyManifest({ manifestPath: finalPath, artifactRoot: root }),
    /digest/i
  );
  assert.deepEqual(await readFile(finalPath), acceptedBytes);
});
