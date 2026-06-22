import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 应用层:jsdom + React + 原生解析 tsconfig 的 "@/*" 别名。
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: "web",
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
