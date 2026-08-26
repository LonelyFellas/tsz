import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { moduleByName, normalizeInventory } from "./ci-test-modules.mjs";

export function createInventoryDocument(
  testModules,
  moduleName,
  repositoryRoot = process.cwd()
) {
  const module = moduleByName(moduleName);
  const tests = normalizeInventory(
    testModules.map((testModule) => ({
      projectName: testModule.project.name,
      moduleId: testModule.moduleId
    })),
    repositoryRoot
  );
  for (const test of tests) {
    if (!module.projects.includes(test.projectName)) {
      throw new Error(
        `${module.name} executed unexpected project ${test.projectName}`
      );
    }
  }
  return { module: module.name, projects: module.projects, tests };
}

export default class CiTestInventoryReporter {
  async onTestRunEnd(testModules) {
    const moduleName = process.env.CI_TEST_MODULE;
    const inventoryFile = process.env.CI_TEST_INVENTORY_FILE;
    if (!moduleName || !inventoryFile) {
      throw new Error("CI_TEST_MODULE and CI_TEST_INVENTORY_FILE are required");
    }
    const document = createInventoryDocument(testModules, moduleName);
    await mkdir(dirname(inventoryFile), { recursive: true });
    await writeFile(inventoryFile, `${JSON.stringify(document, null, 2)}\n`);
  }
}
