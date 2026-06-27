import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 平台后台应用层：jsdom + React。
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: "admin",
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
