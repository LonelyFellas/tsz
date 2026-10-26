import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateReleaseTree } from "./validate-release-tree.mjs";
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createCandidateManifest,
  verifyCandidateManifest
} from "./provenance.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const digest = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");

export function buildConfig(component, env = process.env) {
  if (component === "web")
    return {
      mode: "production",
      env: {
        NEXT_PUBLIC_SITE_URL:
          env.NEXT_PUBLIC_SITE_URL ?? "https://test.tianshengzhi.com"
      }
    };
  assert.equal(component, "admin", "component must be web or admin");
  const settings = {
    VITE_VOICE_PREVIEW: "true",
    VITE_VOICE_AUDIO_UPLOAD: "true",
    VITE_ADMIN_TTS_MOCK: "false",
    VITE_ADMIN_WORDS_MOCK: "false",
    VITE_ADMIN_PART_OF_SPEECH_MOCK: "false"
  };
  for (const flag of [
    "VOICE_EDITOR",
    "AZURE_PRONUNCIATION_INPUTS",
    "FORM_SPELLING_REGULARITY",
    "SENTENCE_FORMATTING"
  ]) {
    const value = env[`DEPLOY_${flag}`] ?? "true";
    assert.ok(
      ["true", "false"].includes(value),
      `DEPLOY_${flag} must be true or false`
    );
    settings[`VITE_${flag}`] = value;
  }
  return { mode: "test", env: settings };
}

export function selectArtifact(artifacts, component, identity) {
  const prefix = `tsz-${component}-${identity.sha}-attempt-`;
  const candidates = artifacts.filter(
    (item) =>
      item.name?.startsWith(prefix) &&
      /^[1-9][0-9]*$/.test(item.name.slice(prefix.length)) &&
      Number(item.name.slice(prefix.length)) <= identity.attempt
  );
  const producerAttempt = Math.max(
    ...candidates.map((item) => Number(item.name.slice(prefix.length)))
  );
  const matches = candidates.filter(
    (item) => Number(item.name.slice(prefix.length)) === producerAttempt
  );
  assert.ok(
    matches.length === 1 &&
      matches[0].expired === false &&
      matches[0].workflow_run?.id === identity.runId &&
      matches[0].workflow_run?.head_sha === identity.sha &&
      matches[0].workflow_run?.head_branch === "main" &&
      Number.isSafeInteger(matches[0].id),
    "a unique unexpired artifact from the exact CI run is required"
  );
  return matches[0];
}

function command(executable, args) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: 180000
  });
  assert.equal(
    result.status,
    0,
    `${executable} failed: ${result.stderr ?? result.error}`
  );
  return result.stdout;
}

export async function packRelease({
  component,
  artifact,
  output,
  identity,
  config,
  releaseId,
  checks
}) {
  await mkdir(output); // Packages are immutable; never replace an existing output.
  // Reject external links before tar can copy an invalid standalone dependency layout.
  await validateReleaseTree(artifact);
  const candidate = await createCandidateManifest({
    component,
    repository: identity.repository,
    gitSha: identity.sha,
    gitTree: identity.tree,
    ciRunId: identity.runId,
    ciRunUrl: `https://github.com/${identity.repository}/actions/runs/${identity.runId}`,
    artifactRoot: artifact,
    artifactPath: `/opt/tsz-releases/${component}/current`,
    outputPath: path.join(output, "candidate.json")
  });
  const archive = path.join(output, "release.tar.gz");
  command("tar", ["-czf", archive, "-C", artifact, "."]);
  const receipt = {
    schema_version: 1,
    component,
    identity,
    config,
    release_id: releaseId,
    platform: "linux",
    arch: "x64",
    node: (
      await readFile(path.join(directory, "../.node-version"), "utf8")
    ).trim(),
    archive_sha256: await digest(archive),
    artifact_sha256: candidate.artifact.sha256,
    candidate_sha256: await digest(path.join(output, "candidate.json")),
    status: "passed",
    checks
  };
  await writeFile(
    path.join(output, "release.json"),
    JSON.stringify(receipt, null, 2) + "\n"
  );
  return receipt;
}

export async function verifyRelease(bundle, expected, output) {
  const receipt = JSON.parse(await readFile(path.join(bundle, "release.json")));
  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.component, expected.component);
  assert.deepEqual(
    receipt.identity,
    expected.identity,
    "release identity mismatch"
  );
  assert.deepEqual(receipt.config, expected.config, "release config mismatch");
  assert.equal(receipt.platform, "linux");
  assert.equal(receipt.arch, "x64");
  assert.equal(receipt.status, "passed", "release verification failed");
  assert.equal(
    receipt.checks?.entry,
    "passed",
    "release verification incomplete"
  );
  if (expected.component === "web") {
    assert.equal(
      receipt.checks?.boot,
      "passed",
      "standalone verification missing"
    );
    assert.equal(receipt.checks?.sharp, "passed", "sharp verification missing");
  }
  const archive = path.join(bundle, "release.tar.gz");
  assert.equal(
    await digest(archive),
    receipt.archive_sha256,
    "archive digest mismatch"
  );
  assert.equal(
    await digest(path.join(bundle, "candidate.json")),
    receipt.candidate_sha256,
    "candidate digest mismatch"
  );
  command("python3", [
    "-I",
    path.join(directory, "unpack-release.py"),
    "tar",
    archive,
    output
  ]);
  const candidate = await verifyCandidateManifest({
    manifestPath: path.join(bundle, "candidate.json"),
    artifactRoot: output
  });
  assert.equal(candidate.component, expected.component);
  assert.deepEqual(candidate.source, {
    repository: expected.identity.repository,
    git_sha: expected.identity.sha,
    git_tree: expected.identity.tree,
    remote_ref: "refs/heads/main"
  });
  assert.deepEqual(candidate.ci, {
    workflow: "CI",
    run_id: expected.identity.runId,
    run_url: `https://github.com/${expected.identity.repository}/actions/runs/${expected.identity.runId}`,
    conclusion: "success"
  });
  assert.equal(candidate.artifact.sha256, receipt.artifact_sha256);
  assert.equal(
    JSON.parse(await readFile(path.join(output, "version.json"))).release_id,
    receipt.release_id
  );
  assert.match(receipt.release_id, /^[a-zA-Z0-9-]+$/);
  return { artifact: output, receipt };
}

async function main() {
  const [action, component, ...args] = process.argv.slice(2);
  if (action === "build") {
    const [root, output] = args;
    const releaseId = `${process.env.GITHUB_SHA}-ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${component}`;
    const config = buildConfig(component);
    const environment = {
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      ...config.env,
      TSZ_RELEASE_ID: releaseId,
      NEXT_TELEMETRY_DISABLED: "1"
    };
    const result = spawnSync(
      "pnpm",
      [
        "--filter",
        `@tsz/${component}`,
        "build",
        ...(component === "admin" ? ["--mode", "test"] : [])
      ],
      { cwd: root, env: environment, stdio: "inherit", timeout: 20 * 60 * 1000 }
    );
    assert.equal(result.status, 0, `${component} build failed`);
    Object.assign(process.env, environment);
    process.argv = [
      process.argv[0],
      process.argv[1],
      "pack",
      component,
      root,
      output
    ];
    await main();
  } else if (action === "pack") {
    const [root, output] = args;
    const identity = {
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
      tree: command("git", ["rev-parse", "HEAD^{tree}"]).trim(),
      runId: Number(process.env.GITHUB_RUN_ID),
      attempt: Number(process.env.GITHUB_RUN_ATTEMPT)
    };
    assert.match(identity.sha, /^[0-9a-f]{40}$/);
    assert.equal(command("git", ["rev-parse", "HEAD"]).trim(), identity.sha);
    assert.equal(
      process.version,
      "v" + (await readFile(path.join(root, ".node-version"), "utf8")).trim()
    );
    assert.equal(process.platform, "linux");
    assert.equal(process.arch, "x64");
    const artifact = path.join(path.dirname(output), `${component}-staged`);
    const releaseId = process.env.TSZ_RELEASE_ID;
    if (component === "web") {
      await cp(path.join(root, "apps/web/.next/standalone"), artifact, {
        recursive: true,
        verbatimSymlinks: true
      });
      await cp(
        path.join(root, "apps/web/.next/static"),
        path.join(artifact, "apps/web/.next/static"),
        { recursive: true }
      );
      await cp(
        path.join(root, "apps/web/public"),
        path.join(artifact, "apps/web/public"),
        { recursive: true }
      );
      await writeFile(
        path.join(artifact, "version.json"),
        JSON.stringify({ release_id: releaseId })
      );
      command("bash", [
        "-c",
        'source "$1"; trap stop_standalone_boot EXIT; verify_standalone_boot "$2" apps/web/server.js',
        "--",
        path.join(directory, "deploy-source.sh"),
        artifact
      ]);
      command("node", [
        "--input-type=module",
        "-e",
        `import {createRequire} from 'node:module'; const require=createRequire(process.argv[1]); const sharp=require('next/dist/server/image-optimizer/transform').getSharp(); const {info}=await sharp({create:{width:2,height:2,channels:3,background:'#000'}}).resize(1,1).webp().toBuffer({resolveWithObject:true}); if(info.width!==1||info.height!==1)process.exit(1);`,
        path.join(artifact, "apps/web/server.js")
      ]);
    } else {
      await cp(path.join(root, "apps/admin/dist"), artifact, {
        recursive: true
      });
      assert.ok((await readdir(artifact)).includes("index.html"));
    }
    await packRelease({
      component,
      artifact,
      output,
      identity,
      releaseId,
      config: buildConfig(component),
      checks: {
        entry: "passed",
        ...(component === "web" ? { boot: "passed", sharp: "passed" } : {})
      }
    });
    await verifyRelease(
      output,
      { component, identity, config: buildConfig(component) },
      path.join(path.dirname(output), `${component}-verified`)
    );
  } else if (action === "select") {
    const [metadata, output] = args;
    const identity = {
      sha: process.env.DEPLOY_GIT_SHA,
      runId: Number(process.env.DEPLOY_CI_RUN_ID),
      attempt: Number(process.env.DEPLOY_CI_RUN_ATTEMPT)
    };
    const data = JSON.parse(await readFile(metadata));
    assert.ok(
      Array.isArray(data) && data.length > 0,
      "artifact pages are required"
    );
    const record = selectArtifact(
      data.flatMap((page) => page.artifacts),
      component,
      identity
    );
    await writeFile(output, JSON.stringify(record));
    console.log(record.id);
  } else if (action === "verify") {
    const [bundle, output] = args;
    const record = JSON.parse(
      await readFile(path.join(path.dirname(bundle), "artifact-record.json"))
    );
    const selected = selectArtifact([record], component, {
      sha: process.env.DEPLOY_GIT_SHA,
      runId: Number(process.env.DEPLOY_CI_RUN_ID),
      attempt: Number(process.env.DEPLOY_CI_RUN_ATTEMPT)
    });
    const identity = {
      repository: process.env.DEPLOY_REPOSITORY,
      sha: process.env.DEPLOY_GIT_SHA,
      tree: process.env.DEPLOY_GIT_TREE,
      runId: Number(process.env.DEPLOY_CI_RUN_ID),
      attempt: Number(selected.name.split("-attempt-")[1])
    };
    const result = await verifyRelease(
      bundle,
      { component, identity, config: buildConfig(component) },
      output
    );
    console.log(result.receipt.release_id);
  } else throw new Error("unknown release artifact action");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
