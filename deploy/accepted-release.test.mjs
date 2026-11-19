import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  readdir
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { packRelease, buildConfig } from "./release-artifact.mjs";
import { acceptManifest } from "./provenance.mjs";
import { readAcceptedRelease } from "./accepted-release.mjs";

for (const component of ["web", "admin"]) {
  test(`${component}: reading an accepted release verifies bytes and never rewrites history`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "tsz-accepted-release."));
    t.after(() => rm(root, { recursive: true, force: true }));
    const releasesRoot = path.join(root, "releases");
    const manifestsRoot = path.join(root, "manifests");
    const componentRoot = path.join(releasesRoot, component);
    const artifact = path.join(componentRoot, "releases/transaction-id");
    await mkdir(artifact, { recursive: true });
    await mkdir(manifestsRoot);
    await mkdir(path.join(componentRoot, "manifests"));
    await symlink(artifact, path.join(componentRoot, "current"));
    await writeFile(
      path.join(artifact, "version.json"),
      JSON.stringify({ release_id: "package-id" })
    );
    await writeFile(path.join(artifact, "index.html"), "accepted bytes");
    const options = { component, releasesRoot, manifestsRoot };
    assert.deepEqual(await readAcceptedRelease(options), {
      schema_version: 1,
      manifest: null,
      receipt: null
    });
    const output = path.join(root, "bundle");
    const receipt = await packRelease({
      component,
      artifact,
      output,
      identity: {
        repository: "LonelyFellas/tsz",
        sha: "a".repeat(40),
        tree: "b".repeat(40),
        runId: 123,
        attempt: 1
      },
      config: buildConfig(component, {}),
      releaseId: "package-id",
      checks: { entry: "passed", boot: "passed", sharp: "passed" }
    });
    const manifestPath = path.join(manifestsRoot, `${component}.json`);
    await acceptManifest({
      manifestPath: path.join(output, "candidate.json"),
      artifactRoot: artifact,
      outputPath: manifestPath
    });
    const before = await readFile(manifestPath, "utf8");
    assert.equal((await readAcceptedRelease(options)).receipt, null);
    const receiptPath = path.join(
      componentRoot,
      "manifests/transaction-id.ci.json"
    );
    await writeFile(receiptPath, JSON.stringify(receipt));
    const state = await readAcceptedRelease(options);
    assert.equal(state.manifest.source.git_sha, "a".repeat(40));
    assert.deepEqual(state.receipt, receipt);
    assert.equal(await readFile(manifestPath, "utf8"), before);
    assert.deepEqual(await readdir(manifestsRoot), [`${component}.json`]);
    await writeFile(receiptPath, "null");
    await assert.rejects(
      readAcceptedRelease(options),
      /existing release metadata must be a JSON object/
    );
    await writeFile(receiptPath, JSON.stringify(receipt));
    await writeFile(manifestPath, "null");
    await assert.rejects(
      readAcceptedRelease(options),
      /existing release metadata must be a JSON object/
    );
    await writeFile(manifestPath, before);
    await writeFile(
      receiptPath,
      JSON.stringify({ ...receipt, release_id: "wrong-id" })
    );
    await assert.rejects(
      readAcceptedRelease(options),
      /accepted package version differs/
    );
    await writeFile(
      receiptPath,
      JSON.stringify({ ...receipt, app_version: "1.0.123" })
    );
    await assert.rejects(
      readAcceptedRelease(options),
      /accepted package app version differs/
    );
    await writeFile(receiptPath, JSON.stringify(receipt));
    await writeFile(path.join(artifact, "index.html"), "corrupt bytes");
    await assert.rejects(
      readAcceptedRelease(options),
      /artifact digest or file_count does not match manifest/
    );
  });
}
