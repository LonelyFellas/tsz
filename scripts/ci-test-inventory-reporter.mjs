import { appendFile, mkdir, writeFile } from "node:fs/promises";
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
  const timings = testModules.map((testModule) => {
    const [entry] = normalizeInventory(
      [{ projectName: testModule.project.name, moduleId: testModule.moduleId }],
      repositoryRoot
    );
    const diagnostic = testModule.diagnostic?.();
    const parts = diagnostic && [
      diagnostic.duration,
      diagnostic.collectDuration,
      diagnostic.setupDuration,
      diagnostic.prepareDuration,
      diagnostic.environmentSetupDuration
    ];
    const known = parts?.every((value) => Number.isFinite(value) && value >= 0);
    return {
      ...entry,
      duration_ms: known
        ? Math.ceil(parts.reduce((sum, value) => sum + value, 0))
        : null,
      test_duration_ms: known ? Math.ceil(diagnostic.duration) : null,
      status: testModule.state?.() ?? "unknown"
    };
  });
  return { module: module.name, projects: module.projects, tests, timings };
}

export function timingSummary(document) {
  const known = document.timings.filter((file) => file.duration_ms !== null);
  const total = known.reduce((sum, file) => sum + file.duration_ms, 0);
  const rows = [...known]
    .sort((left, right) => right.duration_ms - left.duration_ms)
    .slice(0, 10);
  const seconds = (value) => `${(value / 1000).toFixed(2)}s`;
  return `\n### Test file timings: ${document.module}\n\n${known.length} files recorded, ${document.timings.length - known.length} unknown; cumulative file diagnostics ${seconds(total)} (not job wall time).\n\n| File | Tests | Setup/import/environment | Total |\n| --- | ---: | ---: | ---: |\n${rows.map((file) => `| ${file.filepath.replace(/[|\r\n`]/g, " ")} | ${seconds(file.test_duration_ms)} | ${seconds(file.duration_ms - file.test_duration_ms)} | ${seconds(file.duration_ms)} |`).join("\n")}\n`;
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
    console.log(
      `[ci-test-timings] ${JSON.stringify({ module: moduleName, timings: document.timings })}`
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        await appendFile(
          process.env.GITHUB_STEP_SUMMARY,
          timingSummary(document)
        );
      } catch {
        console.error(
          "[ci-test-timings] unable to append summary; inventory is preserved"
        );
      }
    }
  }
}
