import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { verifyManifest } from "./provenance.mjs";

async function optionalJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Called under shared frontend/cross-component locks. This function only reads;
// a missing historical receipt requires publication, never a fabricated identity.
export async function readAcceptedRelease({
  component,
  releasesRoot = "/opt/tsz-releases",
  manifestsRoot = "/opt/tsz-deploy-manifests"
}) {
  assert.ok(component === "web" || component === "admin");
  const manifestPath = path.join(manifestsRoot, `${component}.json`);
  if ((await optionalJson(manifestPath)) === null)
    return { schema_version: 1, manifest: null, receipt: null };
  const root = await realpath(path.join(releasesRoot, component));
  const artifactRoot = await realpath(path.join(root, "current"));
  const manifest = await verifyManifest({ manifestPath, artifactRoot });
  assert.equal(manifest.component, component);
  const release = path.basename(artifactRoot);
  if (path.dirname(artifactRoot) !== path.join(root, "releases"))
    return { schema_version: 1, manifest, receipt: null };
  const receipt = await optionalJson(
    path.join(root, "manifests", `${release}.ci.json`)
  );
  if (receipt !== null) {
    const version = JSON.parse(
      await readFile(path.join(artifactRoot, "version.json"), "utf8")
    );
    assert.equal(
      version.release_id,
      receipt.release_id,
      "accepted package version differs from its CI receipt"
    );
  }
  return { schema_version: 1, manifest, receipt };
}

export function probeAcceptedRelease(component, releaseId) {
  assert.ok(component === "web" || component === "admin");
  const host =
    component === "web"
      ? "test.tianshengzhi.com"
      : "admin-test.tianshengzhi.com";
  const api = component === "web" ? "auth/me" : "admin/profile";
  const request = (route, flags) => {
    const result = spawnSync(
      "curl",
      [
        "--noproxy",
        "*",
        "-sS",
        "-m",
        "8",
        "--resolve",
        `${host}:443:127.0.0.1`,
        ...flags,
        `https://${host}${route}`
      ],
      { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 }
    );
    assert.equal(
      result.status,
      0,
      `accepted ${component} HTTPS probe failed: ${result.stderr}`
    );
    return result.stdout;
  };
  assert.equal(
    JSON.parse(request("/version.json", ["-f"])).release_id,
    releaseId,
    "served version differs from accepted package"
  );
  assert.equal(request("/", ["-o", "/dev/null", "-w", "%{http_code}"]), "200");
  assert.equal(
    request(`/api/v1/${api}`, ["-o", "/dev/null", "-w", "%{http_code}"]),
    "401"
  );
}
