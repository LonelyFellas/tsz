import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertExpectedNodeVersion,
  EXPECTED_NODE_VERSION
} from "./check-node-runtime.mjs";

const readRepositoryFile = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("accepts only the pinned Node runtime", () => {
  assert.doesNotThrow(() => assertExpectedNodeVersion("24.19.0"));
  assert.doesNotThrow(() => assertExpectedNodeVersion("v24.19.0"));

  for (const version of ["22.23.1", "24.18.1", "24.19.1", "25.9.0"]) {
    assert.throws(
      () => assertExpectedNodeVersion(version),
      /Node\.js 24\.19\.0 is required.*Run "nvm use"/
    );
  }
});

test("local version manager files stay aligned", async () => {
  assert.equal(
    (await readRepositoryFile(".nvmrc")).trim(),
    EXPECTED_NODE_VERSION
  );
  assert.equal(
    (await readRepositoryFile(".node-version")).trim(),
    EXPECTED_NODE_VERSION
  );
});

test("package manager and install guards stay aligned", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));
  assert.equal(packageJson.packageManager, "pnpm@10.33.0");
  assert.deepEqual(packageJson.engines, {
    node: EXPECTED_NODE_VERSION,
    pnpm: "10.33.0"
  });
  assert.deepEqual(packageJson.volta, {
    node: EXPECTED_NODE_VERSION,
    pnpm: "10.33.0"
  });
  assert.equal(
    packageJson.scripts.preinstall,
    "node scripts/check-node-runtime.mjs"
  );
  assert.match(packageJson.scripts["test:cov"], /^pnpm check:node && /);
});

test("tooling and application Node types stay on the pinned runtime major", async () => {
  const runtimeMajor = EXPECTED_NODE_VERSION.split(".")[0];
  for (const manifest of [
    "package.json",
    "apps/admin/package.json",
    "apps/web/package.json"
  ]) {
    const packageJson = JSON.parse(await readRepositoryFile(manifest));
    assert.match(
      packageJson.devDependencies["@types/node"],
      new RegExp(`^\\^${runtimeMajor}\\.`)
    );
  }
});

test("CI, Docker, and native deployment use the same pinned Node runtime", async () => {
  const [
    ci,
    setupNodePnpmAction,
    adminDockerfile,
    webDockerfile,
    deployWeb,
    webService,
    claudeInstructions,
    agentInstructions
  ] = await Promise.all([
    readRepositoryFile(".github/workflows/ci.yml"),
    readRepositoryFile(".github/actions/setup-node-pnpm/action.yml"),
    readRepositoryFile("apps/admin/Dockerfile"),
    readRepositoryFile("apps/web/Dockerfile"),
    readRepositoryFile("deploy/deploy-web.sh"),
    readRepositoryFile("deploy/systemd/tsz-web.service"),
    readRepositoryFile("CLAUDE.md"),
    readRepositoryFile("AGENTS.md")
  ]);
  const setupActionSteps = (
    ci.match(/uses: \.\/\.github\/actions\/setup-node-pnpm/g) ?? []
  ).length;
  assert.equal(setupActionSteps, 7);
  assert.equal((ci.match(/uses: actions\/setup-node@v7/g) ?? []).length, 0);
  assert.equal(
    (setupNodePnpmAction.match(/uses: actions\/setup-node@v7/g) ?? []).length,
    1
  );
  assert.match(setupNodePnpmAction, /node-version-file: \.nvmrc/);
  assert.doesNotMatch(ci, /node-version:\s*\d+/);
  assert.doesNotMatch(setupNodePnpmAction, /node-version:\s*\d+/);
  assert.match(adminDockerfile, /^FROM node:24\.19\.0-alpine AS base/m);
  assert.match(webDockerfile, /^FROM node:24\.19\.0-alpine AS base/m);
  // 版本必须由 .node-version 推导出来（现在读的是目标 commit 里的那份），不许写死。
  assert.match(deployWeb, /required_node_version="v\$\(.*\.node-version.*\)"/);
  assert.doesNotMatch(deployWeb, /required_node_version="v24\./);
  assert.match(deployWeb, /ssh tshb-test '\/usr\/bin\/node --version'/);
  const packagePreparation = deployWeb.indexOf("prepare_deploy_artifact web");
  assert.ok(packagePreparation >= 0, "deployment must consume the CI package");
  const serverVersionCheck = deployWeb.indexOf(
    '[[ "$(ssh tshb-test \'/usr/bin/node --version\')" = "$required_node_version" ]]'
  );
  assert.ok(
    serverVersionCheck >= 0,
    "server Node must match the pinned version"
  );
  assert.ok(serverVersionCheck < packagePreparation);
  assert.match(
    webService,
    /^ExecStart=\/usr\/bin\/node apps\/web\/server\.js/m
  );
  assert.match(claudeInstructions, /^@AGENTS\.md$/m);
  assert.match(agentInstructions, /Node = 24\.19\.0/);
});
