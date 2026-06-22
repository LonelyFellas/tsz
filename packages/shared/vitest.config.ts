import { defineConfig } from "vitest/config";

// 纯逻辑包,node 环境即可。
export default defineConfig({
  test: {
    name: "shared",
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
