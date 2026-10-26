import { defineConfig } from "vitest/config";
import { shardCoverageConfig, vitestProjects } from "./vitest.shared-config.ts";

export default defineConfig({
  test: {
    projects: vitestProjects,
    coverage: shardCoverageConfig
  }
});
