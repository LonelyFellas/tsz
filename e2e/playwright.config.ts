import { defineConfig } from "@playwright/test";

const webPort = Number.parseInt(process.env.WEB_E2E_PORT ?? "3000", 10);
const webBaseUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./tests",
  // admin 使用独立构建与 baseURL，由 playwright.admin.config.ts 单独执行。
  testIgnore: ["admin-word-creation.spec.ts", "admin-part-of-speech.spec.ts"],
  // CI 上失败重试一次,本地不重试。
  retries: process.env.CI ? 1 : 0,
  // 控制台用 list 看进度;同时产出 HTML 报告供 CI 失败时上传排查。
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: webBaseUrl,
    // 仅在首次重试时录 trace:平时零开销,flaky 复现时有完整时间线可看。
    trace: "on-first-retry"
  },
  // 让 Playwright 自己起 web 应用(生产构建更接近真实)。
  webServer: {
    command: `pnpm --filter @tsz/web build && pnpm --filter @tsz/web exec next start -p ${webPort}`,
    url: webBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
