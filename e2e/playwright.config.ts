import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // CI 上失败重试一次,本地不重试。
  retries: process.env.CI ? 1 : 0,
  // 控制台用 list 看进度;同时产出 HTML 报告供 CI 失败时上传排查。
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    // 仅在首次重试时录 trace:平时零开销,flaky 复现时有完整时间线可看。
    trace: "on-first-retry"
  },
  // 让 Playwright 自己起 web 应用(生产构建更接近真实)。
  webServer: {
    command: "pnpm --filter @tsz/web build && pnpm --filter @tsz/web start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
