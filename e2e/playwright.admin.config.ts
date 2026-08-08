import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "admin-word-creation.spec.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report-admin" }]
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  // 独立启动 admin；API 由每个 spec 在 page.goto 前全量拦截，不依赖真实后端。
  // mock data-source 保持关闭，让浏览器路径同时验证真实 HTTP client 边界。
  webServer: {
    command:
      "VITE_WORD_CREATION_WIZARD=true VITE_ADMIN_WORDS_MOCK=false pnpm --filter @tsz/admin build && pnpm --filter @tsz/admin preview --host 127.0.0.1",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
