import { localSpeechMock } from "./scripts/local-speech-mock.js";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
// 从 vitest/config 导入 defineConfig：既是合法的 Vite 配置，又能给 `test` 字段类型，
// 从而把测试配置并入本文件——@ 别名与 plugins 只此一处，避免三处（vite/vitest/tsconfig）漂移。
import { defineConfig } from "vitest/config";
import {
  assertAdminTtsMockAllowed,
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

// 第三方库分包：默认分包按「被哪些页面引用」把库代码与业务代码混排，库 chunk 还会
// import 业务入口 index-*.js；入口内嵌全部懒加载 chunk 的文件名，任何业务改动都会让它
// 换哈希，进而连带所有库 chunk 换哈希——每次部署用户都得重下整套 antd。
// 这里按固定身份分组，归属不随页面用法变化，业务改动不再波及库 chunk：
//   1. 入口静态依赖的第三方模块（react-dom、antd 基础设施等）→ vendor-initial；
//   2. 其余 antd 模块按组件目录（antd/es/<组件>）各成一块；
//   3. 其余第三方包按包名各成一块。
function nodeModulePath(moduleId: string): string[] | null {
  const index = moduleId.lastIndexOf("node_modules");
  if (index < 0) return null;
  return moduleId.slice(index + "node_modules".length + 1).split(/[\\/]/);
}

function antdComponentChunk(moduleId: string): string | null {
  const parts = nodeModulePath(moduleId);
  return parts?.[0] === "antd" && parts[1] === "es" && parts[2]
    ? `antd-${parts[2]}`
    : null;
}

function packageChunk(moduleId: string): string | null {
  const [first, second = ""] = nodeModulePath(moduleId) ?? [];
  if (!first || first === "antd") return null;
  const pkg = first.startsWith("@") ? `${first.slice(1)}-${second}` : first;
  return `vendor-${pkg.replace(/[^\w-]/g, "-")}`;
}

export default defineConfig(({ mode, command }) => {
  const buildEnv = loadEnv(mode, process.cwd(), "");
  const production = command === "build" || mode === "production";
  const adminTtsMock = parseBooleanEnvFlag(
    buildEnv.VITE_ADMIN_TTS_MOCK,
    "VITE_ADMIN_TTS_MOCK",
    false
  );

  // production mode 禁止携带 mock；仅 tshb-test 的显式 test mode 构建可用于验收。
  assertAdminTtsMockAllowed(adminTtsMock, production, mode);

  // dev 代理只在启动开发服务器（command === "serve"）时需要；`vite build` 产出的是纯
  // 静态包，不经这个代理，故其相关校验也不应耦合进构建成败——只在 serve 时构建代理。
  const server =
    command === "serve"
      ? { port: 3001, proxy: buildDevProxy(mode) }
      : undefined;

  return {
    plugins: [
      react(),
      localSpeechMock(
        command === "serve" &&
          !production &&
          buildEnv.VITE_LOCAL_SPEECH_MOCK === "true"
      )
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    },
    server,
    build: {
      // vendor-initial 约 700KB（gzip 约 230KB），是刻意合成的长期缓存块，放宽告警阈值。
      chunkSizeWarningLimit: 800,
      rolldownOptions: {
        output: {
          codeSplitting: {
            // priority 高的先认领模块（连同其未被认领的依赖）。
            groups: [
              {
                name: "vendor-initial",
                test: /[\\/]node_modules[\\/]/,
                tags: ["$initial"],
                priority: 30
              },
              { name: antdComponentChunk, priority: 20 },
              { name: packageChunk, priority: 10 }
            ]
          }
        }
      }
    },
    // 平台后台应用层测试：jsdom + React。别名复用上面的 resolve.alias。
    test: {
      name: "admin",
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"]
    }
  };
});
