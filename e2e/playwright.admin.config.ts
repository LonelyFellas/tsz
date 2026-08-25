import { defineConfig } from "@playwright/test";

const adminPort = Number.parseInt(process.env.ADMIN_E2E_PORT ?? "3001", 10);
const adminBaseUrl = `http://127.0.0.1:${adminPort}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "admin-word-creation.spec.ts",
    "admin-word-v3.spec.ts",
    "admin-part-of-speech.spec.ts"
  ],
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report-admin" }]
      ]
    : "list",
  use: {
    baseURL: adminBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  // 独立启动 admin；API 由每个 spec 在 page.goto 前全量拦截，不依赖真实后端。
  // mock data-source 保持关闭，让浏览器路径同时验证真实 HTTP client 边界。
  webServer: {
    command: `VITE_ADMIN_WORDS_MOCK=false VITE_RELATED_SEARCH_V2=true pnpm --filter @tsz/admin build && pnpm --filter @tsz/admin preview --host 127.0.0.1 --port ${adminPort}`,
    url: adminBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
