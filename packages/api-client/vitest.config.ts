import { defineConfig } from "vitest/config";

// 请求层,node 环境,fetch 用 mock 注入。
export default defineConfig({
  test: {
    name: "api-client",
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
