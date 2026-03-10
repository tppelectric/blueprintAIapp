import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@package/shared", "@package/types"],
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
