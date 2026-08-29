import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
// 从 vitest/config 导入 defineConfig：既是合法的 Vite 配置，又能给 `test` 字段类型，
// 从而把测试配置并入本文件——@ 别名与 plugins 只此一处，避免三处（vite/vitest/tsconfig）漂移。
import { defineConfig } from "vitest/config";
import {
  assertAdminPartOfSpeechMockAllowed,
  assertAdminTtsMockAllowed,
  assertAdminWordsMockAllowed,
  parseBooleanEnvFlag
} from "./src/lib/env-flags.js";
import { buildAdminDevProxy } from "./src/lib/dev-proxy.js";

// dev 代理配置：把 /api/v1/* 转发到后端，保证 refresh 的 HttpOnly cookie 与请求同源。
// 复用 web 相同的 BACKEND_API_URL（默认已含 /api/v1 前缀），行为与旧 next.config
// rewrites 一致：/api/v1/<rest> → <BACKEND_API_URL>/<rest>。指向测试线时把它写进
// 本地地址写进 apps/admin/.env.local；线上测试地址写进 .env.test，并通过
// `pnpm dev:test`（Vite 的 test mode）加载。
// 生产由 nginx 在子域层做同样的分流（见 deploy/nginx）。
function buildDevProxy(mode: string) {
  // 读 .env / .env.local（含非 VITE_ 前缀的 BACKEND_API_URL——Vite 不会把它自动注入
  // process.env，须用 loadEnv 显式读，与 web 的 .env.local 约定保持一致）。
  const env = loadEnv(mode, process.cwd(), "");
  return buildAdminDevProxy(env.BACKEND_API_URL);
}

export default defineConfig(({ mode, command }) => {
  const buildEnv = loadEnv(mode, process.cwd(), "");
  const production = command === "build" || mode === "production";
  const adminWordsMock = parseBooleanEnvFlag(
    buildEnv.VITE_ADMIN_WORDS_MOCK,
    "VITE_ADMIN_WORDS_MOCK",
    false
  );
  const adminPartOfSpeechMock = parseBooleanEnvFlag(
    buildEnv.VITE_ADMIN_PART_OF_SPEECH_MOCK,
    "VITE_ADMIN_PART_OF_SPEECH_MOCK",
    false
  );
  const adminTtsMock = parseBooleanEnvFlag(
    buildEnv.VITE_ADMIN_TTS_MOCK,
    "VITE_ADMIN_TTS_MOCK",
    false
  );

  // production mode 禁止携带 mock；仅 tshb-test 的显式 test mode 构建可用于验收。
  assertAdminWordsMockAllowed(adminWordsMock, production, mode);
  assertAdminPartOfSpeechMockAllowed(adminPartOfSpeechMock, production, mode);
  assertAdminTtsMockAllowed(adminTtsMock, production, mode);

  // dev 代理只在启动开发服务器（command === "serve"）时需要；`vite build` 产出的是纯
  // 静态包，不经这个代理，故其相关校验也不应耦合进构建成败——只在 serve 时构建代理。
  const server =
    command === "serve"
      ? { port: 3001, proxy: buildDevProxy(mode) }
      : undefined;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    },
    server,
    // 平台后台应用层测试：jsdom + React。别名复用上面的 resolve.alias。
    test: {
      name: "admin",
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"]
    }
  };
});
