#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const COMPONENTS = {
  web: {
    kind: "directory",
    path: "/opt/tsz-web",
    repository: "LonelyFellas/tsz",
    excludedPaths: ["apps/web/.next/cache"]
  },
  admin: {
    kind: "directory",
    path: "/opt/tsz-admin/dist",
    repository: "LonelyFellas/tsz",
    excludedPaths: []
  },
  api: {
    kind: "file",
    path: "/opt/tsz-rust/target/release/tsz-rust",
    repository: "LonelyFellas/tsz-rust",
    excludedPaths: []
  }
};
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export class ManifestError extends Error {}

function fail(message) {
  throw new ManifestError(message);
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !wanted.includes(key));
  if (missing.length > 0) fail(`${label} missing ${missing.join(", ")}`);
  if (unexpected.length > 0)
    fail(`${label} has unexpected ${unexpected.join(", ")}`);
}

function validateRunUrl(repository, runId, runUrl) {
  let parsed;
  try {
    parsed = new URL(runUrl);
  } catch {
    fail("ci.run_url must be a valid URL");
  }
  const expectedPath = `/${repository}/actions/runs/${runId}`;
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.pathname !== expectedPath ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("ci.run_url must match the repository and run_id on github.com");
  }
}

export function validateManifest(manifest, { allowCandidate = false } = {}) {
  assertExactKeys(
    manifest,
    ["schema_version", "component", "source", "ci", "artifact", "accepted_at"],
    "manifest"
  );
  if (manifest.schema_version !== 1) fail("schema_version must be 1");
  const componentConfig = COMPONENTS[manifest.component];
  if (!componentConfig) fail("component must be web, admin or api");

  assertExactKeys(
    manifest.source,
    ["repository", "git_sha", "git_tree", "remote_ref"],
    "source"
  );
  if (!REPOSITORY_PATTERN.test(manifest.source.repository)) {
    fail("source.repository is invalid");
  }
  if (manifest.source.repository !== componentConfig.repository) {
    fail("source.repository does not match component");
  }
  if (!SHA_PATTERN.test(manifest.source.git_sha))
    fail("source.git_sha is invalid");
  if (!SHA_PATTERN.test(manifest.source.git_tree))
    fail("source.git_tree is invalid");
  if (manifest.source.remote_ref !== "refs/heads/main") {
    fail("source.remote_ref must be refs/heads/main");
  }

  assertExactKeys(
    manifest.ci,
    ["workflow", "run_id", "run_url", "conclusion"],
    "ci"
  );
  if (manifest.ci.workflow !== "CI") fail("ci.workflow must be CI");
  if (
    !Number.isSafeInteger(manifest.ci.run_id) ||
    manifest.ci.run_id <= 0 ||
    manifest.ci.run_id > 999_999_999_999_999
  ) {
    fail("ci.run_id must be a positive integer of at most 15 digits");
  }
  if (manifest.ci.conclusion !== "success")
    fail("ci.conclusion must be success");
  validateRunUrl(
    manifest.source.repository,
    manifest.ci.run_id,
    manifest.ci.run_url
  );

  assertExactKeys(
    manifest.artifact,
    ["kind", "path", "sha256", "file_count", "excluded_paths"],
    "artifact"
  );
  if (manifest.artifact.kind !== componentConfig.kind) {
    fail("artifact.kind does not match component");
  }
  if (manifest.artifact.path !== componentConfig.path) {
    fail("artifact.path does not match component");
  }
  if (
    !Array.isArray(manifest.artifact.excluded_paths) ||
    manifest.artifact.excluded_paths.length !==
      componentConfig.excludedPaths.length ||
    manifest.artifact.excluded_paths.some(
      (entry, index) => entry !== componentConfig.excludedPaths[index]
    )
  ) {
    fail("artifact.excluded_paths does not match component");
  }
  if (!SHA256_PATTERN.test(manifest.artifact.sha256))
    fail("artifact.sha256 is invalid");
  if (
    !Number.isSafeInteger(manifest.artifact.file_count) ||
    manifest.artifact.file_count <= 0
  ) {
    fail("artifact.file_count must be a positive safe integer");
  }
  if (manifest.component === "api" && manifest.artifact.file_count !== 1) {
    fail("api artifact.file_count must be 1");
  }

  if (manifest.accepted_at === null) {
    if (!allowCandidate) fail("accepted_at cannot be null in a final manifest");
  } else if (
    typeof manifest.accepted_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(
      manifest.accepted_at
    ) ||
    Number.isNaN(Date.parse(manifest.accepted_at))
  ) {
    fail("accepted_at must be an RFC3339 UTC timestamp");
  }
  return manifest;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

function isExcluded(relativePath, excludedPaths) {
  return excludedPaths.some(
    (excludedPath) =>
      relativePath === excludedPath ||
      relativePath.startsWith(`${excludedPath}/`)
  );
}

async function collectDirectoryRecords(
  root,
  relative = "",
  excludedPaths = []
) {
  const directory = path.join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory);
  const records = [];
  for (const name of entries) {
    const relativePath = relative ? `${relative}/${name}` : name;
    if (isExcluded(relativePath, excludedPaths)) continue;
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const stat = await lstat(absolutePath);
    if (stat.isDirectory()) {
      records.push(
        ...(await collectDirectoryRecords(root, relativePath, excludedPaths))
      );
    } else if (stat.isFile()) {
      records.push([
        "file",
        relativePath,
        stat.size,
        await sha256File(absolutePath)
      ]);
    } else if (stat.isSymbolicLink()) {
      records.push(["symlink", relativePath, await readlink(absolutePath)]);
    } else {
      fail(`unsupported artifact node: ${relativePath}`);
    }
  }
  return records;
}

export async function digestDirectory(root, { excludedPaths = [] } = {}) {
  const rootStat = await lstat(root).catch(() =>
    fail(`artifact root does not exist: ${root}`)
  );
  if (!rootStat.isDirectory()) fail("artifact root must be a directory");
  const records = await collectDirectoryRecords(root, "", excludedPaths);
  records.sort((left, right) =>
    Buffer.compare(Buffer.from(left[1]), Buffer.from(right[1]))
  );
  if (records.length === 0) fail("artifact directory is empty");
  const hash = createHash("sha256");
  for (const record of records) hash.update(`${JSON.stringify(record)}\n`);
  return { sha256: hash.digest("hex"), fileCount: records.length };
}

async function atomicWriteJson(outputPath, value) {
  const outputDirectory = path.dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true, mode: 0o755 });
  const temporaryPath = path.join(
    outputDirectory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.partial`
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644
    });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function readManifest(manifestPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    fail(`cannot read manifest: ${error.message}`);
  }
  return parsed;
}

async function verifyArtifact(manifest, artifactRoot) {
  if (manifest.artifact.kind !== "directory") {
    fail("frontend verifier only supports directory artifacts");
  }
  const digest = await digestDirectory(artifactRoot, {
    excludedPaths: manifest.artifact.excluded_paths
  });
  if (
    digest.sha256 !== manifest.artifact.sha256 ||
    digest.fileCount !== manifest.artifact.file_count
  ) {
    fail("artifact digest or file_count does not match manifest");
  }
}

export async function createCandidateManifest({
  component,
  repository,
  gitSha,
  gitTree,
  ciRunId,
  ciRunUrl,
  artifactRoot,
  artifactPath,
  outputPath
}) {
  if (!Number.isSafeInteger(ciRunId)) fail("ciRunId must be a safe integer");
  const componentConfig = COMPONENTS[component];
  if (!componentConfig) fail("component must be web, admin or api");
  const digest = await digestDirectory(artifactRoot, {
    excludedPaths: componentConfig.excludedPaths
  });
  const manifest = {
    schema_version: 1,
    component,
    source: {
      repository,
      git_sha: gitSha,
      git_tree: gitTree,
      remote_ref: "refs/heads/main"
    },
    ci: {
      workflow: "CI",
      run_id: ciRunId,
      run_url: ciRunUrl,
      conclusion: "success"
    },
    artifact: {
      kind: "directory",
      path: artifactPath,
      sha256: digest.sha256,
      file_count: digest.fileCount,
      excluded_paths: componentConfig.excludedPaths
    },
    accepted_at: null
  };
  validateManifest(manifest, { allowCandidate: true });
  await atomicWriteJson(outputPath, manifest);
  return manifest;
}

export async function verifyCandidateManifest({ manifestPath, artifactRoot }) {
  const manifest = validateManifest(await readManifest(manifestPath), {
    allowCandidate: true
  });
  if (manifest.accepted_at !== null) fail("candidate accepted_at must be null");
  await verifyArtifact(manifest, artifactRoot);
  return manifest;
}

export async function acceptManifest({
  manifestPath,
  artifactRoot,
  outputPath
}) {
  const candidate = await verifyCandidateManifest({
    manifestPath,
    artifactRoot
  });
  const finalManifest = { ...candidate, accepted_at: new Date().toISOString() };
  validateManifest(finalManifest);
  await atomicWriteJson(outputPath, finalManifest);
  return finalManifest;
}

export async function verifyManifest({ manifestPath, artifactRoot }) {
  const manifest = validateManifest(await readManifest(manifestPath));
  await verifyArtifact(manifest, artifactRoot);
  return manifest;
}

function parseFlags(argumentsList) {
  const flags = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !key?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      fail(`invalid CLI arguments near ${key ?? "end"}`);
    }
    const name = key.slice(2);
    if (Object.hasOwn(flags, name)) fail(`duplicate CLI flag --${name}`);
    flags[name] = value;
  }
  return flags;
}

function requireFlags(flags, expected) {
  assertExactKeys(flags, expected, "CLI flags");
}

async function runCli() {
  const command = process.argv[2];
  const flags = parseFlags(process.argv.slice(3));
  let result;
  if (command === "create-candidate") {
    requireFlags(flags, [
      "component",
      "repository",
      "git-sha",
      "git-tree",
      "ci-run-id",
      "ci-run-url",
      "artifact-root",
      "artifact-path",
      "output"
    ]);
    const ciRunId = Number(flags["ci-run-id"]);
    result = await createCandidateManifest({
      component: flags.component,
      repository: flags.repository,
      gitSha: flags["git-sha"],
      gitTree: flags["git-tree"],
      ciRunId,
      ciRunUrl: flags["ci-run-url"],
      artifactRoot: flags["artifact-root"],
      artifactPath: flags["artifact-path"],
      outputPath: flags.output
    });
  } else if (command === "verify-candidate") {
    requireFlags(flags, ["manifest", "artifact-root"]);
    result = await verifyCandidateManifest({
      manifestPath: flags.manifest,
      artifactRoot: flags["artifact-root"]
    });
  } else if (command === "accept") {
    requireFlags(flags, ["manifest", "artifact-root", "output"]);
    result = await acceptManifest({
      manifestPath: flags.manifest,
      artifactRoot: flags["artifact-root"],
      outputPath: flags.output
    });
  } else if (command === "verify") {
    requireFlags(flags, ["manifest", "artifact-root"]);
    result = await verifyManifest({
      manifestPath: flags.manifest,
      artifactRoot: flags["artifact-root"]
    });
  } else {
    fail(
      "usage: provenance.mjs <create-candidate|verify-candidate|accept|verify> [flags]"
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      component: result.component,
      git_sha: result.source.git_sha,
      ci_run_id: result.ci.run_id,
      artifact_sha256: result.artifact.sha256,
      file_count: result.artifact.file_count,
      accepted_at: result.accepted_at
    })}\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    process.stderr.write(`deployment provenance: ${error.message}\n`);
    process.exitCode = 1;
  });
}
