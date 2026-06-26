/** @type {import('next').NextConfig} */
const nextConfig = {
  // 直接编译 workspace 内的 TS 包,无需预先 build。
  transpilePackages: [
    "@tsz/ui",
    "@tsz/shared",
    "@tsz/types",
    "@tsz/api-client"
  ],
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
