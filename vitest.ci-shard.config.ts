import { defineConfig } from "vitest/config";
import { shardCoverageConfig, vitestProjects } from "./vitest.shared-config";

export default defineConfig({
  test: {
    projects: vitestProjects,
    coverage: shardCoverageConfig
  }
});
