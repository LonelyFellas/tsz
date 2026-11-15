import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildConfig } from "./release-artifact.mjs";
import {
  affectsComponent,
  selectComponent,
  remoteStateScript
} from "./select-component.mjs";

async function fixture(t, component = "web") {
  const cwd = await mkdtemp(path.join(tmpdir(), "tsz-select-component."));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Deployment fixture");
  git("config", "user.email", "fixture@example.invalid");
  const write = async (file, content) => {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), content);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "--quiet", "-m", "fixture");
    return {
      sha: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}")
    };
  };
  await write("apps/web/src/page.tsx", "web");
  await write("apps/admin/src/page.tsx", "admin");
  await write("packages/ui/button.tsx", "shared");
  await write("docs/guide.md", "docs");
  const base = commit();
  const manifest = {
    schema_version: 1,
    component,
    source: {
      repository: "LonelyFellas/tsz",
      git_sha: base.sha,
      git_tree: base.tree,
      remote_ref: "refs/heads/main"
    },
    ci: {
      workflow: "CI",
      run_id: 123,
      run_url: "https://github.com/LonelyFellas/tsz/actions/runs/123",
      conclusion: "success"
    },
    artifact: {
      kind: "directory",
      path: `/opt/tsz-releases/${component}/current`,
      sha256: "a".repeat(64),
      file_count: 2,
      excluded_paths:
        component === "web"
          ? ["apps/web/.next/cache", "apps/web/.next/server/route-cache"]
          : []
    },
    accepted_at: "2026-11-15T00:00:00.000Z"
  };
  const receipt = {
    schema_version: 1,
    component,
    identity: {
      repository: "LonelyFellas/tsz",
      ...base,
      runId: 123,
      attempt: 1
    },
    artifact_sha256: manifest.artifact.sha256,
    release_id: "accepted-release",
    platform: "linux",
    arch: "x64",
    node: "24.19.0",
    status: "passed",
    checks: { entry: "passed", boot: "passed", sharp: "passed" },
    config: buildConfig(component, {})
  };
  const state = { schema_version: 1, manifest, receipt };
  const candidate = structuredClone(receipt);
  return {
    cwd,
    state,
    candidate,
    write,
    commit,
    git,
    select: (target = base) =>
      selectComponent({
        component,
        candidate: {
          ...candidate,
          identity: { ...candidate.identity, ...target }
        },
        state,
        cwd
      })
  };
}

for (const component of ["web", "admin"]) {
  test(`${component}: changes in the other application skip without adopting candidate identity`, async (t) => {
    const f = await fixture(t, component);
    const accepted = JSON.stringify(f.state);
    const other = component === "web" ? "admin" : "web";
    await f.write(`apps/${other}/src/page.tsx`, "changed");
    const target = f.commit();
    const result = f.select(target);
    assert.equal(result.action, "skip");
    assert.equal(result.candidate_sha, target.sha);
    assert.equal(result.accepted_sha, f.state.manifest.source.git_sha);
    assert.equal(result.accepted_ci_run_id, 123);
    assert.equal(JSON.stringify(f.state), accepted);
  });
  test(`${component}: accumulated own changes since its last accepted release still publish`, async (t) => {
    const f = await fixture(t, component);
    await f.write(
      `apps/${component}/src/page.tsx`,
      "missed previous deployment"
    );
    f.commit();
    await f.write("docs/guide.md", "latest docs only");
    const result = f.select(f.commit());
    assert.equal(result.action, "deploy");
    assert.ok(result.changed_inputs.includes(`apps/${component}/src/page.tsx`));
  });
  for (const file of [
    "packages/ui/button.tsx",
    "packages/config/tsconfig.json",
    "pnpm-lock.yaml",
    ".node-version",
    ".github/workflows/ci.yml",
    "deploy/nginx/tshb-test.conf",
    "new-build-directory/input"
  ]) {
    test(`${component}: ${file} changes require publication`, async (t) => {
      const f = await fixture(t, component);
      await f.write(file, "changed");
      assert.equal(f.select(f.commit()).reason, "build-inputs-changed");
    });
  }
}

test("documentation-only and identical input releases can skip", async (t) => {
  const f = await fixture(t);
  assert.equal(f.select().action, "skip");
  await f.write("docs/guide.md", "updated");
  await f.write(".agents/skills/deploy/SKILL.md", "workflow guidance");
  assert.equal(f.select(f.commit()).action, "skip");
});

test("renames out of a component and deleted inputs cannot disappear from the comparison", async (t) => {
  const f = await fixture(t);
  f.git("mv", "apps/web/src/page.tsx", "apps/admin/src/moved.tsx");
  assert.equal(f.select(f.commit()).action, "deploy");
  assert.ok(affectsComponent("apps/web/src/page.tsx", "web"));
});

test("same SHA with different immutable build flags or Node must publish", async (t) => {
  const f = await fixture(t, "admin");
  f.candidate.config = buildConfig("admin", { DEPLOY_VOICE_EDITOR: "false" });
  assert.equal(f.select().reason, "build-config-changed");
  f.candidate.config = structuredClone(f.state.receipt.config);
  f.candidate.node = "24.20.0";
  assert.equal(f.select().reason, "build-config-changed");
});

test("missing historical receipts or Git objects publish; corrupt identities stop", async (t) => {
  const f = await fixture(t);
  const receipt = f.state.receipt;
  f.state.receipt = null;
  assert.equal(f.select().reason, "no-accepted-ci-receipt");
  f.state.receipt = receipt;
  f.state.manifest.source.git_sha = "b".repeat(40);
  receipt.identity.sha = "b".repeat(40);
  assert.equal(f.select().reason, "accepted-source-unavailable");
  receipt.artifact_sha256 = "c".repeat(64);
  assert.throws(() => f.select(), /accepted CI receipt artifact mismatch/);
  f.state.manifest = null;
  f.state.receipt = null;
  assert.equal(f.select().reason, "no-accepted-manifest");
});

test("a mismatched Git tree fails and a non-ancestor requires publication", async (t) => {
  const f = await fixture(t);
  const original = structuredClone(f.candidate.identity);
  f.state.manifest.source.git_tree = "b".repeat(40);
  f.state.receipt.identity.tree = "b".repeat(40);
  assert.throws(() => f.select(), /accepted Git tree mismatch/);
  f.state.manifest.source.git_tree = original.tree;
  f.state.receipt.identity.tree = original.tree;
  await f.write("docs/guide.md", "later accepted release");
  const later = f.commit();
  f.state.manifest.source.git_sha = later.sha;
  f.state.manifest.source.git_tree = later.tree;
  Object.assign(f.state.receipt.identity, later);
  assert.equal(f.select(original).reason, "accepted-source-not-ancestor");
});

test("the streamed reader is self contained and uses the checkout verifier", async () => {
  const source = await remoteStateScript("web", "a".repeat(40));
  assert.match(source, /data:text\/javascript;base64/);
  assert.match(source, /probeAcceptedRelease/);
  assert.match(source, /api.source.git_sha,apiSha/);
  assert.doesNotMatch(source, /acceptManifest/); // Nested module is encoded data, never a CLI acceptance call.
  await assert.rejects(remoteStateScript("api"));
  await assert.rejects(remoteStateScript("web", "main"));
  const transport = await readFile(
    new URL("./deploy-ci-artifact.sh", import.meta.url),
    "utf8"
  );
  assert.match(transport, /exec 8<\/opt\/tsz-cross-deploy.lock/);
  assert.match(transport, /flock -s -n 9/);
  assert.match(transport, /--log-file "\$destination\/accepted-state.json" 60/);
});
