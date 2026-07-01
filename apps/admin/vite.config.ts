import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
// 从 vitest/config 导入 defineConfig：既是合法的 Vite 配置，又能给 `test` 字段类型，
// 从而把测试配置并入本文件——@ 别名与 plugins 只此一处，避免三处（vite/vitest/tsconfig）漂移。
import { defineConfig } from "vitest/config";

// dev 代理配置：把 /api/v1/* 转发到后端，保证 refresh 的 HttpOnly cookie 与请求同源。
// 复用 web 相同的 BACKEND_API_URL（默认已含 /api/v1 前缀），行为与旧 next.config
// rewrites 一致：/api/v1/<rest> → <BACKEND_API_URL>/<rest>。指向测试线时把它写进
// apps/admin/.env.local，如 BACKEND_API_URL=https://<test-host>/api/v1。
// 生产由 nginx 在子域层做同样的分流（见 deploy/nginx）。
function buildDevProxy(mode: string) {
  // 读 .env / .env.local（含非 VITE_ 前缀的 BACKEND_API_URL——Vite 不会把它自动注入
  // process.env，须用 loadEnv 显式读，与 web 的 .env.local 约定保持一致）。
  const env = loadEnv(mode, process.cwd(), "");
  const BACKEND_API_URL = env.BACKEND_API_URL ?? "http://localhost:8080/api/v1";

  let backend: URL;
  try {
    backend = new URL(BACKEND_API_URL);
  } catch {
    throw new Error(
      `[vite] BACKEND_API_URL 不是合法 URL：${BACKEND_API_URL}。请写成含协议与 API 基址的完整地址，如 http://localhost:8080/api/v1`
    );
  }

  // 必须是 http(s) 且 origin 有效：漏写协议时 new URL 不抛错，而是把
  // "localhost:8080/api/v1" 解析成 protocol="localhost:"、origin="null"，
  // 若不拦下，代理 target 会变成字符串 "null" 导致所有接口静默失败。
  if (
    (backend.protocol !== "http:" && backend.protocol !== "https:") ||
    backend.origin === "null"
  ) {
    throw new Error(
      `[vite] BACKEND_API_URL 缺少 http(s) 协议或 origin 非法：${BACKEND_API_URL}。请写成含协议的完整地址，如 http://localhost:8080/api/v1`
    );
  }

  // BACKEND_API_URL 必须含 API 基址路径（默认 /api/v1）。若只给了主机（如
  // https://test-host），backendBasePath 会是空串，下面的 rewrite 会把整个 /api/v1
  // 前缀剥光，导致所有接口静默 404。这里 fail-fast，把隐蔽的运行时错误变成一眼可见的配置错误。
  const backendBasePath = backend.pathname.replace(/\/$/, "");
  if (!backendBasePath) {
    throw new Error(
      `[vite] BACKEND_API_URL 缺少路径前缀：${BACKEND_API_URL}。请写成含 API 基址的完整地址，如 ${backend.origin}/api/v1`
    );
  }

  return {
    "/api/v1": {
      target: backend.origin,
      changeOrigin: true,
      // origin 作 target，前缀路径经 rewrite 拼回，避免 /api/v1/api/v1 双前缀。
      rewrite: (path: string) => path.replace(/^\/api\/v1/, backendBasePath),
      // 代理到远端测试后端时，把 Set-Cookie 的 Domain 抹掉改为 localhost host-only，
      // 否则浏览器因 Domain 不匹配丢弃 refresh cookie，导致登录后会话不持久。
      cookieDomainRewrite: ""
    }
  };
}

export default defineConfig(({ mode, command }) => {
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
