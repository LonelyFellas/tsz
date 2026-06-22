import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // CI 上失败重试一次,本地不重试。
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3000" },
  // 让 Playwright 自己起 web 应用(生产构建更接近真实)。
  webServer: {
    command: "pnpm --filter @tsz/web build && pnpm --filter @tsz/web start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
