import { defineConfig } from "vitest/config";

// monorepo 聚合配置:各子项目有自己的 vitest.config.ts,这里统一编排 + 汇总覆盖率。
export default defineConfig({
  test: {
    projects: [
      "packages/shared",
      "packages/ui",
      "packages/api-client",
      "apps/web",
      "apps/admin"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      // 覆盖率聚焦运行时逻辑：各 package + web 的鉴权/状态/请求层。
      // app 路由文件(page/layout)与纯静态/装配代码以 e2e 与集成测试为主，不纳入单测门槛。
      include: [
        "packages/shared/src/**",
        "packages/ui/src/**",
        "packages/api-client/src/**",
        "apps/web/src/features/auth/**",
        "apps/web/src/lib/**",
        "apps/web/src/stores/**",
        // 与 web 对称：只纳入业务逻辑层（features/lib），app 路由壳由集成/e2e 覆盖。
        "apps/admin/src/features/**",
        "apps/admin/src/lib/**"
      ],
      exclude: [
        "**/index.ts",
        "**/*.d.ts",
        "**/*.test.*",
        // 纯静态展示 / 装配代码，无逻辑分支，由集成与 e2e 覆盖。
        "apps/web/src/features/auth/components/AuthBranding.tsx",
        "apps/web/src/lib/query-client.ts",
        "apps/web/src/lib/constants.ts",
        // 根布局渲染 <html>/<body> 装配壳，不纳入单测。
        "apps/admin/src/app/layout.tsx",
        // 智能词库当前为 Mock 占位实现（未对接后端），逻辑将随接入真实接口重写；
        // 现阶段由 WordEditor/pages 冒烟测试与后续 e2e 保底，暂不纳入单测覆盖门槛。
        // TODO(智能词库): 对接后端后移除本排除项并补齐单测至 90% 门槛。
        "apps/admin/src/features/dictionary/**"
      ],
      // 按目录分别设门槛：包内逻辑 100%；应用业务逻辑层 90%。
      thresholds: {
        "packages/**": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        },
        "apps/web/src/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        "apps/admin/src/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        }
      }
    }
  }
});
