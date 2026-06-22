import { defineConfig } from "vitest/config";

// monorepo 聚合配置:各子项目有自己的 vitest.config.ts,这里统一编排 + 汇总覆盖率。
export default defineConfig({
  test: {
    projects: ["packages/shared", "packages/ui", "apps/web"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: ["packages/*/src/**", "apps/*/src/**"]
    }
  }
});
