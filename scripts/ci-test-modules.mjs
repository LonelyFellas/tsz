import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCoverageVitestArgs } from "./coverage-runner-args.mjs";

export const vitestProjectNames = [
  "shared",
  "ui",
  "api-client",
  "voice-editor",
  "web",
  "admin"
];

export const ciTestModules = [
  {
    name: "packages",
    projects: ["shared", "ui", "api-client", "voice-editor"],
    filters: ["packages"],
    shard: null
  },
  { name: "web", projects: ["web"], filters: ["apps/web"], shard: null },
  {
    name: "admin-1",
    projects: ["admin"],
    filters: ["apps/admin"],
    shard: "1/3"
  },
  {
    name: "admin-2",
    projects: ["admin"],
    filters: ["apps/admin"],
    shard: "2/3"
  },
  {
    name: "admin-3",
    projects: ["admin"],
    filters: ["apps/admin"],
    shard: "3/3"
  }
].map((module) => ({
  ...module,
  artifact: `vitest-blob-${module.name}`,
  blobFile: `${module.name}.blob.json`,
  inventoryFile: `${module.name}.inventory.json`
}));

const expectedModuleNames = ciTestModules.map((module) => module.name);

function assertSafeName(value, label) {
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(`${label} must be a safe lowercase name: ${value}`);
  }
}

function parseShard(shard, moduleName) {
  const match = /^(\d+)\/(\d+)$/.exec(shard ?? "");
  if (!match) throw new Error(`${moduleName} has an invalid shard: ${shard}`);
  return { index: Number(match[1]), count: Number(match[2]) };
}

export function validateModuleManifest(
  modules = ciTestModules,
  projects = vitestProjectNames
) {
  const moduleNames = modules.map((module) => module.name);
  if (
    moduleNames.length !== expectedModuleNames.length ||
    [...moduleNames].sort().join("\0") !==
      [...expectedModuleNames].sort().join("\0")
  ) {
    throw new Error(
      `module manifest must contain exactly: ${expectedModuleNames.join(", ")}`
    );
  }

  const uniqueArtifacts = new Set();
  const uniqueOutputFiles = new Set();
  const projectCounts = new Map(projects.map((project) => [project, 0]));
  const adminShards = [];

  for (const module of modules) {
    assertSafeName(module.name, "module name");
    assertSafeName(module.artifact, "artifact name");
    if (uniqueArtifacts.has(module.artifact)) {
      throw new Error(`duplicate artifact name: ${module.artifact}`);
    }
    uniqueArtifacts.add(module.artifact);

    for (const outputFile of [module.blobFile, module.inventoryFile]) {
      if (
        !outputFile.startsWith(`${module.name}.`) ||
        outputFile.includes("/")
      ) {
        throw new Error(`unsafe output file for ${module.name}: ${outputFile}`);
      }
      if (uniqueOutputFiles.has(outputFile)) {
        throw new Error(`duplicate output file: ${outputFile}`);
      }
      uniqueOutputFiles.add(outputFile);
    }

    if (!Array.isArray(module.projects) || module.projects.length === 0) {
      throw new Error(`${module.name} must select at least one project`);
    }
    if (
      !Array.isArray(module.filters) ||
      module.filters.length === 0 ||
      module.filters.some(
        (filter) =>
          !/^[a-z0-9/-]+$/.test(filter) ||
          filter.startsWith("/") ||
          filter.includes("..")
      )
    ) {
      throw new Error(`${module.name} must use safe repository path filters`);
    }
    for (const project of module.projects) {
      if (!projectCounts.has(project)) {
        throw new Error(`${module.name} selects unknown project: ${project}`);
      }
      projectCounts.set(project, projectCounts.get(project) + 1);
    }

    if (module.name.startsWith("admin-")) {
      if (module.projects.length !== 1 || module.projects[0] !== "admin") {
        throw new Error(`${module.name} must select only the admin project`);
      }
      adminShards.push(parseShard(module.shard, module.name));
    } else if (module.shard !== null) {
      throw new Error(`${module.name} must not define a shard`);
    }
  }

  for (const project of projects) {
    const expectedCount = project === "admin" ? adminShards.length : 1;
    if (projectCounts.get(project) !== expectedCount) {
      throw new Error(
        `${project} must be covered ${expectedCount} time(s), received ${projectCounts.get(project)}`
      );
    }
  }

  const shardCounts = new Set(adminShards.map((shard) => shard.count));
  if (shardCounts.size !== 1) {
    throw new Error("admin shards must use the same denominator");
  }
  const shardCount = adminShards[0]?.count ?? 0;
  const shardIndexes = adminShards
    .map((shard) => shard.index)
    .sort((left, right) => left - right);
  if (
    shardCount !== adminShards.length ||
    shardIndexes.some((index, offset) => index !== offset + 1)
  ) {
    throw new Error("admin shards must form the complete range 1/N..N/N");
  }

  return modules;
}

export function moduleByName(name) {
  validateModuleManifest();
  const module = ciTestModules.find((candidate) => candidate.name === name);
  if (!module) throw new Error(`unknown CI test module: ${name}`);
  return module;
}

function normalizeFilePath(file, repositoryRoot) {
  const withoutQuery = file.split("?", 1)[0];
  const absolutePath = withoutQuery.startsWith("file:")
    ? fileURLToPath(withoutQuery)
    : resolve(repositoryRoot, withoutQuery);
  const repositoryPath = relative(repositoryRoot, absolutePath);
  if (
    repositoryPath === "" ||
    repositoryPath === ".." ||
    repositoryPath.startsWith(`..${sep}`) ||
    isAbsolute(repositoryPath)
  ) {
    throw new Error(`test module is outside the repository: ${file}`);
  }
  return repositoryPath.split(sep).join("/");
}

export function normalizeInventory(entries, repositoryRoot = process.cwd()) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("test inventory must not be empty");
  }
  const seen = new Set();
  const normalized = entries.map((entry) => {
    if (!vitestProjectNames.includes(entry.projectName)) {
      throw new Error(
        `inventory contains unknown project: ${entry.projectName}`
      );
    }
    const filepath = normalizeFilePath(
      entry.file ?? entry.filepath ?? entry.moduleId,
      repositoryRoot
    );
    const key = `${entry.projectName}\0${filepath}`;
    if (seen.has(key)) throw new Error(`duplicate inventory tuple: ${key}`);
    seen.add(key);
    return { projectName: entry.projectName, filepath };
  });
  return normalized.sort(
    (left, right) =>
      left.projectName.localeCompare(right.projectName) ||
      left.filepath.localeCompare(right.filepath)
  );
}

export function buildModuleVitestArgs(
  moduleName,
  outputDirectory,
  repositoryRoot = process.cwd()
) {
  const module = moduleByName(moduleName);
  const blobPath = resolve(
    repositoryRoot,
    outputDirectory,
    ".vitest-reports",
    module.blobFile
  );
  return [
    ...buildCoverageVitestArgs([]),
    "--config=vitest.ci-shard.config.ts",
    "--reporter=blob",
    "--reporter=./scripts/ci-test-inventory-reporter.mjs",
    `--outputFile.blob=${blobPath}`,
    ...module.filters.map((filter) => resolve(repositoryRoot, filter)),
    ...(module.shard ? [`--shard=${module.shard}`] : [])
  ];
}

export function validateInventorySet(
  fullEntries,
  inventoryDocuments,
  repositoryRoot = process.cwd()
) {
  const expected = normalizeInventory(fullEntries, repositoryRoot);
  const expectedKeys = new Set(
    expected.map((entry) => `${entry.projectName}\0${entry.filepath}`)
  );
  const actualKeys = new Set();
  const seenModules = new Set();

  for (const document of inventoryDocuments) {
    const module = moduleByName(document.module);
    if (seenModules.has(module.name)) {
      throw new Error(`duplicate module inventory: ${module.name}`);
    }
    seenModules.add(module.name);
    if (
      !Array.isArray(document.projects) ||
      [...document.projects].sort().join("\0") !==
        [...module.projects].sort().join("\0")
    ) {
      throw new Error(`${module.name} inventory has mismatched projects`);
    }
    const entries = normalizeInventory(document.tests, repositoryRoot);
    for (const entry of entries) {
      if (!module.projects.includes(entry.projectName)) {
        throw new Error(
          `${module.name} inventory contains project ${entry.projectName}`
        );
      }
      const key = `${entry.projectName}\0${entry.filepath}`;
      if (actualKeys.has(key)) {
        throw new Error(`test tuple executed more than once: ${key}`);
      }
      actualKeys.add(key);
    }
  }

  const missingModules = expectedModuleNames.filter(
    (moduleName) => !seenModules.has(moduleName)
  );
  if (missingModules.length > 0) {
    throw new Error(`missing module inventories: ${missingModules.join(", ")}`);
  }

  const missing = [...expectedKeys].filter((key) => !actualKeys.has(key));
  const extra = [...actualKeys].filter((key) => !expectedKeys.has(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `inventory mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`
    );
  }

  return expected;
}

export async function validateInventoryFiles(
  fullInventoryPath,
  inventoryDirectory,
  reportDirectory,
  repositoryRoot = process.cwd()
) {
  const validateFiles = async (directory, expectedFiles, label) => {
    const directoryEntries = await readdir(directory, { withFileTypes: true });
    const actualFiles = directoryEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    if (actualFiles.join("\0") !== expectedFiles.join("\0")) {
      throw new Error(
        `${label} files mismatch; expected=${expectedFiles.join(",")}; actual=${actualFiles.join(",")}`
      );
    }
  };
  const expectedFiles = ciTestModules
    .map((module) => module.inventoryFile)
    .sort();
  const expectedBlobFiles = ciTestModules
    .map((module) => module.blobFile)
    .sort();
  await validateFiles(inventoryDirectory, expectedFiles, "inventory");
  await validateFiles(reportDirectory, expectedBlobFiles, "blob");

  const fullEntries = JSON.parse(await readFile(fullInventoryPath, "utf8"));
  const documents = await Promise.all(
    expectedFiles.map(async (filename) =>
      JSON.parse(await readFile(resolve(inventoryDirectory, filename), "utf8"))
    )
  );
  const inventory = validateInventorySet(
    fullEntries,
    documents,
    repositoryRoot
  );
  const projectCounts = Object.fromEntries(
    vitestProjectNames.map((project) => [
      project,
      inventory.filter((entry) => entry.projectName === project).length
    ])
  );
  console.log(
    `[ci-test-inventory] ${inventory.length} files verified exactly once: ${JSON.stringify(projectCounts)}`
  );
  return inventory;
}

async function runModule(moduleName, outputDirectory) {
  const module = moduleByName(moduleName);
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const vitestCli = resolve(repositoryRoot, "node_modules/vitest/vitest.mjs");
  const inventoryFile = resolve(
    repositoryRoot,
    outputDirectory,
    ".ci-inventories",
    module.inventoryFile
  );
  const child = spawn(
    process.execPath,
    [
      vitestCli,
      ...buildModuleVitestArgs(module.name, outputDirectory, repositoryRoot)
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CI_TEST_MODULE: module.name,
        CI_TEST_INVENTORY_FILE: inventoryFile
      },
      stdio: "inherit"
    }
  );
  return new Promise((resolveExitCode, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExitCode(code ?? 1));
  });
}

async function main(rawArgs) {
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const [command, ...commandArgs] = args;
  if (command === "run" && commandArgs.length === 2) {
    process.exitCode = await runModule(commandArgs[0], commandArgs[1]);
    return;
  }
  if (command === "validate-inventories" && commandArgs.length === 3) {
    await validateInventoryFiles(
      commandArgs[0],
      commandArgs[1],
      commandArgs[2]
    );
    return;
  }
  throw new Error(
    "usage: ci-test-modules.mjs run <module> <output-dir> | validate-inventories <full-inventory.json> <inventory-dir> <report-dir>"
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`[ci-test-modules] ${error.message}`);
    process.exitCode = 1;
  }
}
