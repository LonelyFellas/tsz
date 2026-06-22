import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 组件包,jsdom + React 插件。
export default defineConfig({
  plugins: [react()],
  test: {
    name: "ui",
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
