import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 自包含产物:只打包运行所需文件 + 裁剪后的 node_modules,用于 Docker 镜像。
  output: "standalone",
  // monorepo 必需:把文件追踪根设到仓库根,否则 standalone 会漏掉 workspace 依赖。
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@tsz/ui",
    "@tsz/shared",
    "@tsz/types",
    "@tsz/api-client"
  ],
  // 同源代理到后端，保证 refresh 的 HttpOnly cookie 与请求同源可用。
  async rewrites() {
    const backendBase =
      process.env.BACKEND_API_URL ?? "http://localhost:8080/api/v1";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendBase}/:path*`
      }
    ];
  }
};

export default nextConfig;
