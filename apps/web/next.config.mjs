/** @type {import('next').NextConfig} */
const nextConfig = {
  // 直接编译 workspace 内的 TS 包,无需预先 build。
  transpilePackages: ["@tsz/ui", "@tsz/shared", "@tsz/types", "@tsz/api-client"]
};

export default nextConfig;
