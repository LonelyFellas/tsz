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
  assert.doesNotThrow(() => assertExpectedNodeVersion("22.23.1"));
  assert.doesNotThrow(() => assertExpectedNodeVersion("v22.23.1"));

  for (const version of ["21.7.3", "22.23.0", "22.24.0", "24.18.0", "25.9.0"]) {
    assert.throws(
      () => assertExpectedNodeVersion(version),
      /Node\.js 22\.23\.1 is required.*Run "nvm use"/
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

test("CI and Docker builds use the same pinned Node runtime", async () => {
  const [ci, adminDockerfile, webDockerfile] = await Promise.all([
    readRepositoryFile(".github/workflows/ci.yml"),
    readRepositoryFile("apps/admin/Dockerfile"),
    readRepositoryFile("apps/web/Dockerfile")
  ]);
  assert.equal((ci.match(/node-version-file: \.nvmrc/g) ?? []).length, 3);
  assert.doesNotMatch(ci, /node-version:\s*\d+/);
  assert.match(adminDockerfile, /^FROM node:22\.23\.1-alpine AS base/m);
  assert.match(webDockerfile, /^FROM node:22\.23\.1-alpine AS base/m);
});
