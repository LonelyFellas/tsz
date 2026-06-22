import { defineConfig } from "vitest/config";

// monorepo 聚合配置:各子项目有自己的 vitest.config.ts,这里统一编排 + 汇总覆盖率。
export default defineConfig({
  test: {
    projects: [
      "packages/shared",
      "packages/ui",
      "packages/api-client",
      "apps/web"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      // 覆盖率聚焦各包的运行时逻辑(app 页面以集成测试为主,暂不纳入门槛)。
      include: [
        "packages/shared/src/**",
        "packages/ui/src/**",
        "packages/api-client/src/**"
      ],
      exclude: ["**/index.ts", "**/*.d.ts", "**/*.test.*"],
      // 包内逻辑要求 100%,回退时 CI 失败。
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  }
});
