/** @type {import('next').NextConfig} */
const nextConfig = {
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
