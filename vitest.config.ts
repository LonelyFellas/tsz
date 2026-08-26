import { defineConfig } from "vitest/config";
import { fullCoverageConfig, vitestProjects } from "./vitest.shared-config";

// monorepo 聚合配置:各子项目有自己的 vitest.config.ts,这里统一编排 + 汇总覆盖率。
export default defineConfig({
  test: {
    projects: vitestProjects,
    coverage: fullCoverageConfig
  }
});
