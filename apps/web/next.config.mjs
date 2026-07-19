import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// next dev 时 NODE_ENV=development；next build 时 =production。
const isBuild = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⚠️ output:standalone + outputFileTracingRoot 仅「生产构建」需要
  // （standalone 要把 monorepo 的 workspace 依赖纳入自包含产物）。
  // 开发下若设 outputFileTracingRoot 指向 monorepo 根，会把 Turbopack 的
  // 工作区根推断成「巨树根」，令首次编译的 PostCSS 转换子进程在错误根里解析
  // 插件失败、Turbopack 无上限重生子进程 → 秒级上千 → 吃光内存冻机
  // （Turbopack bug，见 vercel/next.js#94432 / #92978，16.2.10 仍未修）。
  // 故 dev 不设这两项——Turbopack 根推断正确、单个 PostCSS worker、稳定。
  ...(isBuild
    ? {
        output: "standalone",
        outputFileTracingRoot: path.join(__dirname, "../../")
      }
    : {}),
  transpilePackages: [
    "@tsz/ui",
    "@tsz/shared",
    "@tsz/types",
    "@tsz/api-client"
  ],
  async rewrites() {
    // 默认指向本地 tsz-rust(cargo run,端口 8383);生产部署用 BACKEND_API_URL 覆盖。
    const backendBase =
      process.env.BACKEND_API_URL ?? "http://localhost:8383/api/v1";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendBase}/:path*`
      }
    ];
  }
};

export default nextConfig;
