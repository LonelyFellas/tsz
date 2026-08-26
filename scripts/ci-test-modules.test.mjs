import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ciTestModules,
  buildModuleVitestArgs,
  validateInventoryFiles,
  validateInventorySet,
  validateModuleManifest,
  vitestProjectNames
} from "./ci-test-modules.mjs";
import { createInventoryDocument } from "./ci-test-inventory-reporter.mjs";
import {
  coverageCollectionConfig,
  fullCoverageConfig,
  shardCoverageConfig,
  vitestProjects
} from "../vitest.shared-config.ts";

function cloneModules() {
  return structuredClone(ciTestModules);
}

function inventoryFixture() {
  const files = [
    { projectName: "shared", file: "/repo/packages/shared/src/a.test.ts" },
    { projectName: "ui", file: "/repo/packages/ui/src/a.test.ts" },
    {
      projectName: "api-client",
      file: "/repo/packages/api-client/src/a.test.ts"
    },
    {
      projectName: "voice-editor",
      file: "/repo/packages/voice-editor/src/a.test.ts"
    },
    { projectName: "web", file: "/repo/apps/web/src/a.test.ts" },
    { projectName: "admin", file: "/repo/apps/admin/src/a.test.ts" },
    { projectName: "admin", file: "/repo/apps/admin/src/b.test.ts" },
    { projectName: "admin", file: "/repo/apps/admin/src/c.test.ts" }
  ];
  const byModule = {
    packages: files.slice(0, 4),
    web: files.slice(4, 5),
    "admin-1": files.slice(5, 6),
    "admin-2": files.slice(6, 7),
    "admin-3": files.slice(7, 8)
  };
  const documents = ciTestModules.map((module) => ({
    module: module.name,
    projects: module.projects,
    tests: byModule[module.name].map((entry) => ({
      projectName: entry.projectName,
      filepath: entry.file.slice("/repo/".length)
    }))
  }));
  return { files, documents };
}

test("M01: module manifest covers all six Vitest projects", () => {
  assert.equal(validateModuleManifest(), ciTestModules);
  assert.deepEqual(vitestProjectNames, [
    "shared",
    "ui",
    "api-client",
    "voice-editor",
    "web",
    "admin"
  ]);
  assert.equal(ciTestModules.length, 5);
});

test("M02: admin shards must form a complete 1/N..N/N range", () => {
  const modules = cloneModules();
  modules.find((module) => module.name === "admin-3").shard = "2/3";
  assert.throws(
    () => validateModuleManifest(modules),
    /complete range 1\/N\.\.N\/N/
  );
});

test("M03: duplicate projects and unknown modules fail closed", () => {
  const duplicateProject = cloneModules();
  duplicateProject
    .find((module) => module.name === "packages")
    .projects.push("web");
  assert.throws(
    () => validateModuleManifest(duplicateProject),
    /web must be covered 1 time\(s\), received 2/
  );

  const unknownModule = cloneModules();
  unknownModule[0].name = "unknown";
  assert.throws(
    () => validateModuleManifest(unknownModule),
    /module manifest must contain exactly/
  );
});

test("M04: artifact and output names are unique and path-safe", () => {
  assert.equal(
    new Set(ciTestModules.map((module) => module.artifact)).size,
    ciTestModules.length
  );
  const modules = cloneModules();
  modules[0].artifact = "../unsafe";
  assert.throws(
    () => validateModuleManifest(modules),
    /artifact name must be a safe lowercase name/
  );
});

test("M05: module arguments retain maxWorkers=2 and path selection", () => {
  const args = buildModuleVitestArgs("admin-2", "artifacts", "/repo");
  assert.ok(args.includes("--coverage"));
  assert.ok(args.includes("--maxWorkers=2"));
  assert.ok(args.includes("/repo/apps/admin"));
  assert.ok(!args.some((argument) => argument.startsWith("--project=")));
  assert.ok(args.includes("--shard=2/3"));
  assert.ok(args.includes("--reporter=blob"));
  assert.ok(
    args.includes("--reporter=./scripts/ci-test-inventory-reporter.mjs")
  );
  assert.ok(
    args.includes(
      "--outputFile.blob=/repo/artifacts/.vitest-reports/admin-2.blob.json"
    )
  );
});

test("M06: full and shard configs share collection policy", () => {
  assert.deepEqual(vitestProjects, [
    "packages/shared",
    "packages/ui",
    "packages/api-client",
    "packages/voice-editor",
    "apps/web",
    "apps/admin"
  ]);
  assert.equal(fullCoverageConfig.provider, coverageCollectionConfig.provider);
  assert.deepEqual(
    fullCoverageConfig.include,
    coverageCollectionConfig.include
  );
  assert.deepEqual(
    fullCoverageConfig.exclude,
    coverageCollectionConfig.exclude
  );
  assert.deepEqual(
    shardCoverageConfig.include,
    coverageCollectionConfig.include
  );
  assert.deepEqual(
    shardCoverageConfig.exclude,
    coverageCollectionConfig.exclude
  );
  assert.deepEqual(shardCoverageConfig.reporter, []);
  assert.equal(shardCoverageConfig.thresholds, undefined);
  assert.ok(fullCoverageConfig.thresholds);
});

test("M07: reporter inventory comes from actual TestModule values", () => {
  const document = createInventoryDocument(
    [
      {
        project: { name: "admin" },
        moduleId: "/repo/apps/admin/src/example.test.ts"
      }
    ],
    "admin-1",
    "/repo"
  );
  assert.deepEqual(document, {
    module: "admin-1",
    projects: ["admin"],
    tests: [
      {
        projectName: "admin",
        filepath: "apps/admin/src/example.test.ts"
      }
    ]
  });
});

test("M08: full and module inventories must be an exact tuple partition", () => {
  const { files, documents } = inventoryFixture();
  assert.equal(validateInventorySet(files, documents, "/repo").length, 8);

  const missing = structuredClone(documents);
  missing[0].tests.pop();
  assert.throws(
    () => validateInventorySet(files, missing, "/repo"),
    /inventory mismatch; missing=/
  );

  const duplicate = structuredClone(documents);
  duplicate[3].tests[0] = duplicate[2].tests[0];
  assert.throws(
    () => validateInventorySet(files, duplicate, "/repo"),
    /executed more than once/
  );
});

test("M09: inventory and blob files reject missing or extra artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsz-ci-inventory-"));
  const inventoryDirectory = join(root, "inventories");
  const reportDirectory = join(root, "reports");
  const fullInventoryPath = join(root, "full.json");
  const { files, documents } = inventoryFixture();
  try {
    await mkdir(inventoryDirectory);
    await mkdir(reportDirectory);
    await writeFile(fullInventoryPath, JSON.stringify(files));
    await Promise.all(
      documents.map((document) =>
        writeFile(
          join(inventoryDirectory, `${document.module}.inventory.json`),
          JSON.stringify(document)
        )
      )
    );
    await Promise.all(
      ciTestModules.map((module) =>
        writeFile(join(reportDirectory, module.blobFile), "{}")
      )
    );
    assert.equal(
      (
        await validateInventoryFiles(
          fullInventoryPath,
          inventoryDirectory,
          reportDirectory,
          "/repo"
        )
      ).length,
      8
    );
    await writeFile(join(inventoryDirectory, "unexpected.json"), "{}");
    await assert.rejects(
      validateInventoryFiles(
        fullInventoryPath,
        inventoryDirectory,
        reportDirectory,
        "/repo"
      ),
      /inventory files mismatch/
    );
    await rm(join(inventoryDirectory, "unexpected.json"));
    await rm(join(reportDirectory, "admin-3.blob.json"));
    await assert.rejects(
      validateInventoryFiles(
        fullInventoryPath,
        inventoryDirectory,
        reportDirectory,
        "/repo"
      ),
      /blob files mismatch/
    );
    await writeFile(join(reportDirectory, "admin-3.blob.json"), "{}");
    await writeFile(join(reportDirectory, "unexpected.blob.json"), "{}");
    await assert.rejects(
      validateInventoryFiles(
        fullInventoryPath,
        inventoryDirectory,
        reportDirectory,
        "/repo"
      ),
      /blob files mismatch/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
